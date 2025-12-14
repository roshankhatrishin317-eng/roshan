// Comprehensive iFlow integration test
import { IFlowApiService } from './src/openai/iflow-core.js';
import { IFlowApiServiceAdapter } from './src/adapter.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

async function testIFlowIntegration() {
    console.log('=== iFlow Integration Test ===\n');

    try {
        // Test 1: Direct IFlowApiService
        console.log('Test 1: IFlowApiService initialization');
        const service = new IFlowApiService({});
        await service.initialize();
        console.log('✓ IFlowApiService initialized successfully\n');

        // Test 2: Non-streaming request
        console.log('Test 2: Non-streaming chat completion');
        const unaryRequest = {
            model: 'qwen3-coder-plus',
            messages: [{ role: 'user', content: 'Say "test successful" in exactly two words' }],
            stream: false
        };
        const unaryResponse = await service.generateContent('qwen3-coder-plus', unaryRequest);
        console.log('✓ Non-streaming response received:');
        console.log(`  Model: ${unaryResponse.model}`);
        console.log(`  Message: ${unaryResponse.choices[0].message.content}\n`);

        // Test 3: Streaming request
        console.log('Test 3: Streaming chat completion');
        const streamRequest = {
            model: 'qwen3-coder-plus',
            messages: [{ role: 'user', content: 'Count from 1 to 3' }],
            stream: true
        };
        let streamedContent = '';
        for await (const chunk of service.generateContentStream('qwen3-coder-plus', streamRequest)) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
                streamedContent += delta;
                process.stdout.write('.');
            }
        }
        console.log('\n✓ Streaming response received:');
        console.log(`  Content: ${streamedContent}\n`);

        // Test 4: List models
        console.log('Test 4: List available models');
        const modelList = await service.listModels();
        console.log(`✓ Found ${modelList.data.length} models`);
        console.log(`  First 5 models: ${modelList.data.slice(0, 5).map(m => m.id).join(', ')}\n`);

        // Test 5: IFlowApiServiceAdapter
        console.log('Test 5: IFlowApiServiceAdapter');
        const adapter = new IFlowApiServiceAdapter({});
        const adapterResponse = await adapter.generateContent('qwen3-coder-plus', {
            model: 'qwen3-coder-plus',
            messages: [{ role: 'user', content: 'Reply with OK' }]
        });
        console.log('✓ Adapter response received:');
        console.log(`  Message: ${adapterResponse.choices[0].message.content}\n`);

        // Test 6: Check API key
        console.log('Test 6: Verify API key');
        const apiKey = service.getApiKey();
        console.log(`✓ API key available: ${apiKey.substring(0, 10)}...\n`);

        // Test 7: Check expiry
        console.log('Test 7: Check credential expiry');
        const isNearExpiry = service.isExpiryDateNear();
        console.log(`✓ Credentials near expiry: ${isNearExpiry}\n`);

        // Test 8: Verify credentials file
        console.log('Test 8: Verify credentials file');
        const credPath = path.join(os.homedir(), '.iflow', 'oauth_creds.json');
        const credContent = await fs.readFile(credPath, 'utf-8');
        const creds = JSON.parse(credContent);
        console.log('✓ Credentials file valid:');
        console.log(`  Has API key: ${!!creds.api_key}`);
        console.log(`  Has email: ${!!creds.email}`);
        console.log(`  Type: ${creds.type || 'oauth'}\n`);

        console.log('=== All Tests Passed ===');

    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testIFlowIntegration().catch(console.error);
