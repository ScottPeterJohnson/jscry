package net.jscry

import org.springframework.boot.web.server.Ssl
import java.io.File
import java.time.Duration


data class ServerConfig(
		val requireAuthForSourceMap : Boolean = true,
		val serveMinJs : Boolean = true,
		val startWebServer : Boolean = false,
		val startWorkers : Boolean = false,
		val host : String,
		val httpsPort: Int = 443,
		val ssl : Ssl,
		val webEmbedHeaderConfigurationCachePeriodSeconds: Duration = Duration.ofMinutes(30),
		val staticFileCacheTimeout: Duration = Duration.ofDays(1),
		val databaseUrl: String,
	//Preferred log level
		val logLevel: String = "debug",
	//Whether to wait until a configuration is generated rather than passing on transforming a client
		val alwaysServeConfiguration : Boolean = false,
	//Whether to disable caching for development purposes
		val disableCaching: Boolean = false,
	//Name of the web bundle to serve
		val bundleName: String = "web/jscry-web.js",
	//Whether to enable JVM assertions
		val assertions: Boolean = true,
	//Whether to enable endpoints useful for testing purposes
		val enableTestEndpoints: Boolean = false,
	//Worker threads per core (0 for minimum of 1 worker thread)
		val workerMultiplier : Int = 5
) {
	companion object {
		fun get(): ServerConfig {
			val useDev = !"dev".equals(propertyOrEnv("production"), ignoreCase = true)
			val config = if (useDev) developmentConfig else productionWebConfig
			System.setProperty("org.slf4j.simpleLogger.defaultLogLevel", "warn")
			System.setProperty("org.slf4j.simpleLogger.showDateTime", "true")
			System.setProperty("org.slf4j.simpleLogger.dateTimeFormat", "yyyy-MM-dd HH:mm:ss.SSS z")
			System.setProperty("org.slf4j.simpleLogger.log.net.jscry", config.logLevel)
			//Exceptions on websockets are by default only logged in debug (??????)
			System.setProperty("org.slf4j.simpleLogger.log.org.springframework.web.socket.handler.ExceptionWebSocketHandlerDecorator", "debug")
			if(useDev){ //Use the bundled keystore w/ our localhost cert added
				val temp = File.createTempFile("keystore", ".jks")
				temp.writeBytes(ClassLoader.getSystemResourceAsStream("keystore.jks").readBytes())
				System.setProperty("javax.net.ssl.trustStore", temp.absolutePath)
			}
			return config
		}
	}
}

fun ServerConfig.httpsHost() : String = this.host + if(this.httpsPort == 443) "" else ":${this.httpsPort}"

val productionWebConfig = ServerConfig(
		host = "jscry.net",
		startWebServer = true,
		startWorkers = true,
		databaseUrl = "jdbc:postgresql://localhost:5432/jscry?user=jscry&password=jscry",
		logLevel = "warn",
		bundleName = "web/jscry-web-min.js",
		ssl = Ssl().apply {
			keyStore = "/keystore.p12"
			keyStorePassword = "jscry"
			keyPassword = "jscry"
		}
)

val developmentConfig = ServerConfig(
		host = "localhost",
		requireAuthForSourceMap = false,
		serveMinJs = false,
		startWebServer = true,
		startWorkers = true,
		alwaysServeConfiguration = true,
		webEmbedHeaderConfigurationCachePeriodSeconds = Duration.ZERO,
		staticFileCacheTimeout = Duration.ZERO,
		databaseUrl = "jdbc:postgresql://localhost:5432/jscry?user=jscry&password=jscry",
		logLevel = "debug",
		disableCaching = true,
		bundleName = "web/jscry-web.js",
		enableTestEndpoints = true,
		workerMultiplier = 0,
		ssl = Ssl().apply {
			keyStore = "classpath:keystore.p12"
			keyStorePassword = "localhost"
			keyPassword = "localhost"
		},
		httpsPort = 8080
)

val unitTestConfig = developmentConfig.copy(
		databaseUrl = "jdbc:postgresql://localhost:5432/jscry_test?user=jscry_test&password=jscry_test"
)

fun propertyOrEnv(name : String) : String? {
	return System.getProperty(name) ?: System.getenv(name)
}