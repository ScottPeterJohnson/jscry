package net.jscry.utility

import com.esotericsoftware.kryo.Kryo
import com.esotericsoftware.kryo.io.ByteBufferInputStream
import com.esotericsoftware.kryo.io.Input
import com.esotericsoftware.kryo.io.Output
import org.ehcache.ValueSupplier
import org.ehcache.config.builders.CacheConfigurationBuilder
import org.ehcache.config.builders.CacheManagerBuilder
import org.ehcache.config.builders.ResourcePoolsBuilder
import org.ehcache.config.units.MemoryUnit
import org.ehcache.expiry.Duration
import org.ehcache.expiry.Expiry
import org.ehcache.spi.serialization.Serializer
import org.objenesis.strategy.StdInstantiatorStrategy
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.util.*
import java.util.concurrent.TimeUnit

private val ehcacheExpiry = object : Expiry<CacheKey<*>, CacheValue<*>> {
	override fun getExpiryForUpdate(key: CacheKey<*>?,
	                                oldValue: ValueSupplier<out CacheValue<*>>?,
	                                newValue: CacheValue<*>): Duration {
		return Duration.of(newValue.expirationMs.toLong(), TimeUnit.MILLISECONDS)
	}

	override fun getExpiryForAccess(key: CacheKey<*>?, value: ValueSupplier<out CacheValue<*>>?): Duration? {
		return null
	}

	override fun getExpiryForCreation(key: CacheKey<*>?, value: CacheValue<*>): Duration {
		return Duration.of(value.expirationMs.toLong(), TimeUnit.MILLISECONDS)
	}
}

private val kryo = Kryo().apply {
	instantiatorStrategy = Kryo.DefaultInstantiatorStrategy(StdInstantiatorStrategy())
}
private class EhcacheKryoSerializer<T>(val clazz : Class<T>) : Serializer<T> {
	override fun equals(`object`: T, binary: ByteBuffer): Boolean {
		return Objects.equals(`object`, read(binary))
	}

	override fun read(binary: ByteBuffer): T {
		val input = Input(ByteBufferInputStream(binary))
		return kryo.readObject(input, clazz)
	}

	override fun serialize(`object`: T): ByteBuffer {
		val output = Output(ByteArrayOutputStream())
		kryo.writeObject(output, `object`)
		output.close()
		return ByteBuffer.wrap(output.buffer)
	}

}
/*
private class EhcacheKotlinInstantiator : InstantiatorStrategy {

}*/

private val ehcacheManager = CacheManagerBuilder.newCacheManagerBuilder()
		.with(CacheManagerBuilder.persistence(File("cache")))
		.build(true)
private val ehcache = ehcacheManager.createCache("global",
		CacheConfigurationBuilder.newCacheConfigurationBuilder(CacheKey::class.java,
				CacheValue::class.java,
				ResourcePoolsBuilder.newResourcePoolsBuilder()
						.heap(100, MemoryUnit.MB)
						.disk(7, MemoryUnit.GB)
				)
				.withExpiry(ehcacheExpiry)
				.withKeySerializer(EhcacheKryoSerializer(CacheKey::class.java))
				.withValueSerializer(EhcacheKryoSerializer(CacheValue::class.java))

)


private data class CacheKey<Key>(val cacheIdentifier : Int, val key : Key)
private data class CacheValue<Value>(val expirationMs : Int, val value : Value)

private val takenIdentifiers = mutableSetOf<Int>()



open class CacheView<K,V>(private val identifier : Int) {
	init {
		assert(!takenIdentifiers.contains(identifier))
		takenIdentifiers.add(identifier)
	}

	val single = SingleConcurrentComputation<K, Optional<V>>()

	fun put(key : K, value : V){
		ehcache.put(CacheKey(identifier, key as Any), CacheValue(expirationMs, value))
	}
	fun get(key : K) : V? {
		return (ehcache.get(CacheKey(identifier, key as Any)) as CacheValue<V>?)?.value
	}
	fun getOrPut(key : K, put : (key : K)->V) : V {
		return getOrMaybePut(key, put) ?: throw AssertionError()
	}

	fun getOrMaybePut(key : K, maybePut : (K)->V?) : V? {
		val cacheKey = CacheKey(identifier, key as Any)
		val result = (ehcache.get(cacheKey) as CacheValue<V>?)?.value
		if(result != null){
			return result
		} else {
			val value = single.compute(key, { Optional.ofNullable(maybePut(key)) })
			if(value.isPresent){
				ehcache.put(cacheKey, CacheValue(expirationMs, value.get() as Any))
			}
			return value.orElse(null)
		}
	}

	private var expirationMs = TimeUnit.MILLISECONDS.convert(15, TimeUnit.MINUTES).toInt()
	fun expireAfter(time : Long, unit : TimeUnit) {
		expirationMs = TimeUnit.MILLISECONDS.convert(time, unit).toInt()
	}
}

open class LoadingCacheView<K,V>(identifier : Int, private val loader : (key : K)->V) : CacheView<K,V>(identifier) {
	fun load(key : K) : V {
		return getOrPut(key, loader)
	}
}

open class MaybeLoadingCacheView<K,V>(identifier : Int, private val maybeLoader : (key : K)->V?) : CacheView<K,V>(identifier) {
	fun maybeLoad(key : K) : V? {
		return getOrMaybePut(key, maybeLoader)
	}
}

class PresenceCache<K>(identifier : Int, private val loader : (key : K)->Boolean){
	private fun maybeLoad(key : K) : Unit? {
		val present = loader(key)
		return if(present){
			Unit
		}
		else {
			null
		}
	}
	private val cache = MaybeLoadingCacheView<K,Unit>(identifier, { maybeLoad(it) })
	fun present(key : K) : Boolean {
		return cache.maybeLoad(key) == Unit
	}
}