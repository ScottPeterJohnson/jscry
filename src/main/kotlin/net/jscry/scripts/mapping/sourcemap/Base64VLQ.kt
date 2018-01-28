package net.jscry.scripts.mapping.sourcemap

/*
 * Derived from com.atlassian.sourcemap
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * We encode our variable length numbers as base64 encoded strings with
 * the least significant digit coming first.  Each base64 digit encodes
 * a 5-bit value (0-31) and a continuation bit.  Signed values can be
 * represented by using the least significant bit of the value as the
 * sign bit.

 * Code based on Google Closure Compiler https://code.google.com/p/closure-compiler
 */
object Base64VLQ {
	// A map used to convert integer values in the range 0-63 to their base64 values.
	private val BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	private val BASE64_DECODE_MAP = IntArray(256, init = { -1 })
	init {
		for(i in 0..(BASE64_MAP.length-1)){
			BASE64_DECODE_MAP[BASE64_MAP[i].toInt()] = i
		}
	}

	// A Base64 VLQ digit can represent 5 bits, so it is base-32.
	private val VLQ_BASE_SHIFT = 5
	private val VLQ_BASE = 1 shl VLQ_BASE_SHIFT

	// A mask of bits for a VLQ digit (11111), 31 decimal.
	private val VLQ_BASE_MASK = VLQ_BASE - 1

	// The continuation bit is the 6th bit.
	private val VLQ_CONTINUATION_BIT = VLQ_BASE

	/**
	 * Converts from a two-complement value to a value where the sign bit is
	 * is placed in the least significant bit.  For example, as decimals:
	 * 1 becomes 2 (10 binary), -1 becomes 3 (11 binary)
	 * 2 becomes 4 (100 binary), -2 becomes 5 (101 binary)
	 */
	private fun toVLQSigned(value: Int): Int {
		return if (value < 0) (-value shl 1) + 1 else (value shl 1) + 0
	}

	/**
	 * Converts to a two-complement value from a value where the sign bit is
	 * is placed in the least significant bit.  For example, as decimals:
	 *   2 (10 binary) becomes 1, 3 (11 binary) becomes -1
	 *   4 (100 binary) becomes 2, 5 (101 binary) becomes -2
	 */
	private fun fromVLQSigned(value: Int): Int {
		val negate = value and 1 == 1
		val result = value shr 1
		return if (negate) -result else result
	}

	/**
	 * Writes a VLQ encoded value to the provide appendable.
	 */
	fun encode(out: Appendable, value: Int) {
		var signedValue = toVLQSigned(value)
		do {
			var digit = signedValue and VLQ_BASE_MASK
			signedValue = signedValue ushr VLQ_BASE_SHIFT
			if (signedValue > 0) digit = digit or VLQ_CONTINUATION_BIT
			out.append(BASE64_MAP[digit])
		} while (signedValue > 0)
	}

	fun decode(firstChar : Char, more: CharIterator): Int {
		var result = 0
		var continuation: Boolean
		var shift = 0
		var char = firstChar
		do {
			var digit = BASE64_DECODE_MAP[char.toInt()]
			continuation = digit and VLQ_CONTINUATION_BIT != 0
			digit = digit and VLQ_BASE_MASK
			result += (digit shl shift)
			shift += VLQ_BASE_SHIFT
			if(continuation){
				char = more.next()
			}
		} while (continuation)

		return fromVLQSigned(result)
	}
}
