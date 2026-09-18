/**
 * pcm-processor.js – AudioWorklet that converts raw mic Float32 samples
 * into 16-bit PCM chunks and posts them back to the main thread.
 * Served by FastAPI at GET /processor.js
 */


class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // Accumulate 4096 samples (~256ms at 16 kHz) before sending
        this.BUFFER_SIZE = 4096;
        this.buffer      = new Float32Array(this.BUFFER_SIZE);
        this.writeIndex  = 0;
    }

    process(inputs) {
        const channel = inputs[0]?.[0];
        if (!channel) return true;

        for (let i = 0; i < channel.length; i++) {
            this.buffer[this.writeIndex++] = channel[i];

            if (this.writeIndex >= this.BUFFER_SIZE) {
                // Convert Float32 → Int16 PCM
                const pcm = new Int16Array(this.BUFFER_SIZE);
                for (let j = 0; j < this.BUFFER_SIZE; j++) {
                    const s = Math.max(-1, Math.min(1, this.buffer[j]));
                    pcm[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                // Transfer ownership (zero-copy)
                this.port.postMessage(pcm.buffer, [pcm.buffer]);
                this.writeIndex = 0;
            }
        }
        return true;   // keep processor alive
    }
}

registerProcessor("pcm-processor", PCMProcessor);
