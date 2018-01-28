package net.jscry.collection

import com.sun.deploy.util.BufferUtil.MB
import net.jscry.Server.Companion.config
import net.jscry.database.tables.dsl.ScriptConfigurationsRow
import net.jscry.projects.validProject
import net.jscry.scripts.*
import net.jscry.scripts.configuration.*
import net.jscry.scripts.mapping.sourcemap.UnresolvableSourceMapException
import net.jscry.utility.background
import net.jscry.utility.gson
import net.jscry.utility.log
import mu.KLogging
import org.eclipse.jetty.websocket.api.WebSocketBehavior
import org.eclipse.jetty.websocket.api.WebSocketPolicy
import org.eclipse.jetty.websocket.server.WebSocketServerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.handler.TextWebSocketHandler
import org.springframework.web.socket.server.jetty.JettyRequestUpgradeStrategy
import org.springframework.web.socket.server.support.DefaultHandshakeHandler
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ThreadLocalRandom
import java.util.concurrent.locks.Lock
import java.util.concurrent.locks.ReentrantLock
import javax.servlet.ServletContext
import kotlin.concurrent.withLock

@Configuration
@EnableWebSocket
open class WebSocketConfig : WebSocketConfigurer {
	override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
		registry.addHandler(WebSocketCollector(), webSocketCollectionPath).setAllowedOrigins("*").setHandshakeHandler(handshakeHandler())
	}


	@Suppress("SpringKotlinAutowiring")
	@Autowired lateinit var context : ServletContext
	@Bean open fun handshakeHandler(): DefaultHandshakeHandler {
		val policy = WebSocketPolicy(WebSocketBehavior.SERVER)
		policy.maxTextMessageSize =  (100L * MB).toInt()
		policy.maxBinaryMessageSize = (100L * MB).toInt()

		return DefaultHandshakeHandler(JettyRequestUpgradeStrategy(WebSocketServerFactory(context, policy)))
	}
}

val webSocketCollectionPath = "/ws"

data class SessionData(val writeLock : Lock, var handshake : Handshake?, var sessionId : Long?, val scriptConfigurations: MutableMap<Long, ScriptConfiguration>)
var WebSocketSession.sessionData : SessionData?
	get(){ return this.attributes["sessionData"] as SessionData? }
	set(value){ this.attributes["sessionData"] = value; }

class WebSocketCollector : TextWebSocketHandler() {
	companion object : KLogging()

	private val waitingOnContentForConfiguration = mutableSetOf<Pair<String, ScriptId>>()
	override fun handleTextMessage(session: WebSocketSession, socketMessage: TextMessage) {
		val messageText = socketMessage.payload
		logger.debug { "Received ${messageText.take(500)}"}
		val message = gson.fromJson(messageText, FromClientMessage::class.java)
		val sessionInfo = session.sessionData ?: throw IllegalStateException("Session not found")
		if(sessionInfo.handshake == null && message !is Handshake){ throw IllegalStateException("No handshake") }
		when(message) {
			is Handshake -> {
				logger.debug { "Received handshake" }
				if(validProject(message.apiKey)){
					sessionInfo.handshake = message
					sessionInfo.sessionId = recordSession(
							apiKey = message.apiKey,
							ipAddress = session.remoteAddress.address
					)
				} else {
					logger.warn { "Invalid API key sent from ${session.remoteAddress.address}: ${message.apiKey}" }
					session.close(CloseStatus(1002, "Invalid API key"))
				}
			}
			is CollectionData -> {
				logger.debug { "Collection packet received" }
				recordCollectionData(sessionInfo.sessionId!!,
						sessionInfo.scriptConfigurations,
						message)
			}
			is ScriptCollectionRequest -> {
				background {
					logger.debug { "Script collection request received for ${message.url} ${message.hash}" }
					val scriptResult = getOrCreateScriptId(
							apiKey = sessionInfo.handshake!!.apiKey,
							url = message.url,
							hash = message.hash
					)
					val needsContent = !scriptHasContentCache.present(scriptResult)
					if (needsContent) {
						session.safeSend(TextMessage(gson.toJson(ServerNeedsContentMessage(url = message.url,
								hash = message.hash,
								scriptId = scriptResult))))
					}
					var configuration = cachedScriptConfigurationFor(scriptResult)
					if (configuration == null && config.alwaysServeConfiguration) {
						//We need to send one ASAP
						if (needsContent) {
							//Wait to receive the content before constructing the config
							waitingOnContentForConfiguration.add(Pair(session.id, scriptResult))
						} else {
							//Construct and return inline
							configuration = newScriptConfigurationFor(scriptResult)
						}
					}
					if(configuration != null) sendConfiguration(session, message.url, message.hash, configuration)
				}
			}
			is ScriptContentMessage -> {
				background {
					logger.debug { "Received content for script ${message.scriptId}" }
					val save: () -> Unit = {
						saveScriptContent(sessionInfo.handshake!!.apiKey,
								message.scriptId,
								message.content)
						try {
							checkForAndSaveSourceMap(sessionInfo.handshake!!.apiKey, message)
						} catch(e: UnresolvableSourceMapException) {
							log.warn(e) { "Could not resolve sourcemap for ${message.fullUrl}" }
						}
					}
					if (waitingOnContentForConfiguration.contains(Pair(session.id, message.scriptId))) {
						log.debug { "Immediately constructing configuration for ${message.scriptId}" }
						waitingOnContentForConfiguration.remove(Pair(session.id, message.scriptId))
						save()
						val script = getScriptRow(message.scriptId)
						val configuration = newScriptConfigurationFor(message.scriptId)
						sendConfiguration(session, script.url, script.hash, configuration)
					} else {
						save()
					}
				}
			}
			is PrefetchedScriptUsedMessage -> {
				background {
					val configuration = scriptConfigurationById(message.scriptConfigurationId) ?: throw IllegalStateException(
							"Script configuration ${message.scriptConfigurationId} not found")
					useScriptWithConfiguration(session, configuration, message.seed)
				}
			}
			is SetupDoneMessage -> {
				registerActualPageScripts(
						apiKey = sessionInfo.handshake!!.apiKey,
						page = sessionInfo.handshake!!.href,
						scripts = sessionInfo.scriptConfigurations.keys.toList()
				)
			}
		}
	}

	fun WebSocketSession.safeSend(message : TextMessage){
		val sessionInfo = this.sessionData ?: throw IllegalStateException("Session not found")
		sessionInfo.writeLock.withLock {
			this.sendMessage(message)
		}
	}

	fun useScriptWithConfiguration(session : WebSocketSession, configuration : ScriptConfigurationsRow, seed : Int){
		val sessionInfo = session.sessionData ?: throw IllegalStateException("Session not found")
		sessionInfo.scriptConfigurations.put(configuration.scriptId, configuration.config)
		linkSessionToScriptConfiguration(
				sessionId = sessionInfo.sessionId!!,
				scriptId = configuration.scriptId,
				scriptConfigurationId = configuration.scriptConfigurationId,
				seed = seed
		)
		incrementScriptUseCount(configuration.scriptId)
	}

	fun sendConfiguration(session : WebSocketSession, url : String, hash : Int, configuration : ScriptConfigurationsRow?){
		if(configuration == null){
			session.safeSend(TextMessage(gson.toJson(inactiveClientMessage.copy(url = url, hash = hash))))
			return
		}
		val seed = ThreadLocalRandom.current().nextInt()
		val toClient = configuration.toClientMessage(
				url = url,
				hash = hash,
				seed = seed
		)
		session.safeSend(TextMessage(gson.toJson(toClient)))
		useScriptWithConfiguration(session, configuration, seed)
	}

	override fun afterConnectionEstablished(session: WebSocketSession) {
		logger.info { "Connection from ${session.remoteAddress}"}
		session.sessionData = SessionData(
				writeLock = ReentrantLock(),
				handshake = null,
				sessionId = null,
				scriptConfigurations = ConcurrentHashMap()
		)
	}

	override fun afterConnectionClosed(session: WebSocketSession?, status: CloseStatus?) {
		logger.info { "Closing session from ${session?.remoteAddress}, id: ${session?.sessionData?.sessionId?:"(No id)"}"}
		session?.sessionData?.sessionId?.let(::endSession)
	}
}

