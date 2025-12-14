// Test kimi-k2-thinking model specifically
import { IFlowApiService } from './src/openai/iflow-core.js';

async function testKimiThinking() {
    console.log('=== Testing kimi-k2-thinking Model ===\n');

    const service = new IFlowApiService({});
    await service.initialize();

    // Test 1: Non-streaming
    console.log('Test 1: Non-streaming request');
    const nonStreamRequest = {
        model: 'kimi-k2-thinking',
        messages: [{ role: 'user', content: 'What is 2+2? Think through it.' }],
        stream: false
    };

    try {
        const response = await service.generateContent('kimi-k2-thinking', nonStreamRequest);
        console.log('\n=== NON-STREAMING RESPONSE ===');
        console.log('Content:', response.choices?.[0]?.message?.content || 'EMPTY');
        console.log('Full structure:', JSON.stringify(response, null, 2));
    } catch (error) {
        console.error('Non-streaming error:', error.message);
    }

    console.log('\n\n');

    // Test 2: Streaming
    console.log('Test 2: Streaming request');
    const streamRequest = {
        model: 'kimi-k2-thinking',
        messages: [{ role: 'user', content: 'Count to 3' }],
        stream: true
    };

    try {
        console.log('Starting stream...');
        let chunkCount = 0;
        let totalContent = '';
        let firstChunk = null;
        let lastChunk = null;

        for await (const chunk of service.generateContentStream('kimi-k2-thinking', streamRequest)) {
            chunkCount++;
            if (chunkCount === 1) {
                firstChunk = chunk;
                console.log('\nFirst chunk:', JSON.stringify(chunk, null, 2));
            }
            lastChunk = chunk;

            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
                totalContent += delta;
                process.stdout.write('.');
            }
        }

        console.log('\n\n=== STREAMING SUMMARY ===');
        console.log('Total chunks:', chunkCount);
        console.log('Total content:', totalContent || 'EMPTY');
        console.log('Last chunk:', JSON.stringify(lastChunk, null, 2));
    } catch (error) {
        console.error('Streaming error:', error.message);
        console.error(error.stack);
    }
}

testKimiThinking().catch(console.error);
