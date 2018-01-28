package net.jscry

import com.fasterxml.jackson.databind.Module
import com.fasterxml.jackson.module.kotlin.KotlinModule
import net.jscry.console.AuthenticationFilter
import net.jscry.utility.setupDatabase
import net.jscry.utility.startWorkers
import mu.KLogging
import org.springframework.boot.Banner
import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.web.embedded.jetty.JettyServletWebServerFactory
import org.springframework.boot.web.server.Ssl
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.io.ClassPathResource
import org.springframework.core.io.Resource
import org.springframework.http.CacheControl
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.stereotype.Controller
import org.springframework.util.StringUtils
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurationSupport
import org.springframework.web.servlet.resource.PathResourceResolver
import org.springframework.web.servlet.resource.ResourceResolverChain
import java.util.*
import java.util.concurrent.TimeUnit
import javax.servlet.http.HttpServletRequest
import javax.servlet.http.HttpServletResponse


fun main(args : Array<String>){
	val config = ServerConfig.get()
	ClassLoader.getSystemClassLoader().setDefaultAssertionStatus(config.assertions)
	Server.config = config
	Server.logger.info { "Using config $config" }
	setupDatabase(config)

	if(config.startWebServer) {
		Server.ssl = config.ssl
		val app = SpringApplication(Server::class.java)
		app.setDefaultProperties(springProperties())
		app.setBannerMode(Banner.Mode.OFF)
		app.run()
	}
	if(config.startWorkers){
		startWorkers()
	}
}

fun springProperties() : Properties {
	val properties = Properties()
	properties.setProperty("spring.servlet.multipart.max-file-size", "100MB")
	properties.setProperty("spring.servlet.multipart.max-request-size", "100MB")
	return properties
}

class MinJsPathResourceResolver : PathResourceResolver() {
	override fun resolveResource(request: HttpServletRequest,
	                             requestPath: String,
	                             locations: MutableList<out Resource>,
	                             chain: ResourceResolverChain): Resource? {
		val extension = StringUtils.getFilenameExtension(requestPath)
		val pathWithoutExtension = StringUtils.stripFilenameExtension(requestPath)
		if(Server.config.serveMinJs && extension == "js" && !pathWithoutExtension.endsWith("-min")){
			return super.resolveResource(request, pathWithoutExtension + "-min." + extension, locations, chain)
		} else {
			if(requestPath.startsWith("welcome")){
				return super.resolveResource(request, "/frontpage/frontpage.html", locations, chain)
			}
			if(requestPath == "console"){
				return super.resolveResource(request, "/console/console.html", locations, chain)
			}
			return super.resolveResource(request, requestPath, locations, chain)
		}
	}
}

@Configuration
open class StaticConfiguration : WebMvcConfigurationSupport() {
	override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
		val resolver = MinJsPathResourceResolver()
		resolver.setAllowedLocations(ClassPathResource("classpath:/static/"))
		if(!Server.config.disableCaching){
			registry.addResourceHandler("/**")
					.addResourceLocations("classpath:/static/web/")
					.setCacheControl(CacheControl.maxAge(12, TimeUnit.HOURS).cachePublic())
					.resourceChain(true)
					.addResolver(resolver)
		}
		registry.addResourceHandler("/**")
				.addResourceLocations("classpath:/static/")
				.setCacheControl(CacheControl.noCache().cachePublic())
				.resourceChain(true)
				.addResolver(resolver)
	}
}

@Controller
class FrontPage {
	@RequestMapping("/")
	fun frontPage(response : HttpServletResponse): Unit {
		//For obscure reasons, the static content resource handler refuses to serve on the root path, so we have to do a redirect
		response.sendRedirect("/welcome")
	}
}

@SpringBootApplication
open class Server {
	companion object : KLogging() {
		lateinit var config: ServerConfig
		lateinit var ssl : Ssl
	}
	@Bean open fun authentication() = AuthenticationFilter()
	@Bean open fun containerCustomizer() : JettyServletWebServerFactory {
		val default = JettyServletWebServerFactory()
		default.serverCustomizers
		default.port = config.httpsPort
		default.ssl = ssl
		return default
	}
	/*@Bean open fun embeddedServletContainerFactory() : UndertowServletWebServerFactory {
		val factory = UndertowServletWebServerFactory()
		factory.port = config.httpsPort
		factory.addDeploymentInfoCustomizers(UndertowDeploymentInfoCustomizer {
			it.addServletContextAttribute(WebSocketDeploymentInfo.ATTRIBUTE_NAME, WebSocketDeploymentInfo().addExtension(
					PerMessageDeflateHandshake()))
		})
		return factory
	}*/
	/*@Bean open fun configure() : EmbeddedServletContainerCustomizer {
		return EmbeddedServletContainerCustomizer {
			val undertow = it as UndertowEmbeddedServletContainerFactory
			undertow.port = config.httpsPort
			undertow.addDeploymentInfoCustomizers(UndertowDeploymentInfoCustomizer {
				it.addServletContextAttribute(WebSocketDeploymentInfo.ATTRIBUTE_NAME, WebSocketDeploymentInfo().addExtension(PerMessageDeflateHandshake()))
			})
		}
	}*/
	@Bean open fun jacksonKotlinModule() : Module {
		return KotlinModule()
	}
	@Bean open fun jacksonParams() : MappingJackson2HttpMessageConverter {
		return MappingJackson2HttpMessageConverter()
	}

}