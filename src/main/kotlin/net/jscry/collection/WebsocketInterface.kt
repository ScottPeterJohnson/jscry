package net.jscry.collection

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import net.jscry.scripts.ScriptId
import net.jscry.scripts.configuration.CodeInsert
import net.jscry.utility.ClientVisible
import java.lang.reflect.Type
import java.util.*

//Messages sent by the client to the server
interface FromClientMessage : ClientVisible {
	val type : FromClientMessageType
}

enum class FromClientMessageType {
	COLLECTION_DATA,
	HANDSHAKE,
	SCRIPT_COLLECTION_REQUEST,
	SCRIPT_CONTENT,
	PREFETCHED_SCRIPT_USED,
	SETUP_DONE;
}

data class AddedCodeResult(val scriptCommandId : Long, val result : String)

data class CollectionData(
		var executionData: HashMap<Long, HashMap<Long, Int>>,
		val addedCodeResults : List<AddedCodeResult>,
		override val type : FromClientMessageType = FromClientMessageType.COLLECTION_DATA
) : FromClientMessage

data class ScriptCollectionRequest(
		var url : String,
		val hash : Int,
        override val type : FromClientMessageType = FromClientMessageType.SCRIPT_COLLECTION_REQUEST
) : FromClientMessage

data class ScriptContentMessage(
		val scriptId: Long,
		val fullUrl : String,
		val content : String,
		val sourceMapHeader : String?,
		override val type : FromClientMessageType = FromClientMessageType.SCRIPT_CONTENT
) : FromClientMessage

data class Handshake(
		var apiKey: UUID,
		var href: String,
		override val type : FromClientMessageType = FromClientMessageType.HANDSHAKE
) : FromClientMessage

data class PrefetchedScriptUsedMessage(
		val scriptId : Long,
		val scriptConfigurationId : Long,
		val seed : Int,
		override val type : FromClientMessageType = FromClientMessageType.PREFETCHED_SCRIPT_USED
) : FromClientMessage

data class SetupDoneMessage(
		override val type : FromClientMessageType = FromClientMessageType.SETUP_DONE
) : FromClientMessage


class FromClientMessageDeserializer : JsonDeserializer<FromClientMessage> {
	override fun deserialize(json: JsonElement, typeOfT: Type, context: JsonDeserializationContext): FromClientMessage {
		val jsonObject = json.asJsonObject
		val jsonType = jsonObject.get("type")
		val typeString = jsonType.asString
		val type = FromClientMessageType.valueOf(typeString)
		return when(type){
			FromClientMessageType.COLLECTION_DATA -> context.deserialize(json, CollectionData::class.java)
			FromClientMessageType.HANDSHAKE -> context.deserialize(json, Handshake::class.java)
			FromClientMessageType.SCRIPT_COLLECTION_REQUEST -> context.deserialize(json, ScriptCollectionRequest::class.java)
			FromClientMessageType.SCRIPT_CONTENT -> context.deserialize(json, ScriptContentMessage::class.java)
			FromClientMessageType.PREFETCHED_SCRIPT_USED -> context.deserialize(json, PrefetchedScriptUsedMessage::class.java)
			FromClientMessageType.SETUP_DONE -> context.deserialize(json, SetupDoneMessage::class.java)
		}
	}

}

//Messages from the server to the client

enum class FromServerMessageType {
	SCRIPT_CONFIG,
	SERVER_NEEDS_CONTENT
}

interface FromServerMessage : ClientVisible {
	val type : FromServerMessageType
}

data class ScriptConfigurationMessage(
		val active : Boolean,
		val url : String,
		val hash : Int,
		val scriptId: ScriptId,
		val excludedRangeStarts : List<Int>,
		val excludedRangeEnds : List<Int>,
		val excludedStatements: List<Int>,
		val includedStatements : List<Int>,
		val codeInserts : Map<Int,List<CodeInsert>>,
		val scriptConfigurationId: Long,
		val seed : Int,
		override val type : FromServerMessageType = FromServerMessageType.SCRIPT_CONFIG
) : FromServerMessage

val dummyScriptConfigurationMessage = ScriptConfigurationMessage(
		active = true,
		url = "",
		hash = 0,
		scriptId = 0,
		excludedRangeStarts = emptyList(),
		excludedRangeEnds = emptyList(),
		excludedStatements = emptyList(),
		includedStatements = emptyList(),
		scriptConfigurationId = 0,
		seed = 0,
		codeInserts = emptyMap()
)

data class ServerNeedsContentMessage(
		val url : String,
		val hash : Int,
		val scriptId : ScriptId,
		override val type : FromServerMessageType = FromServerMessageType.SERVER_NEEDS_CONTENT
) : FromServerMessage