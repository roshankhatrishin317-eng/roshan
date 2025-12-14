// Debug iFlow response structure
import { IFlowApiService } from './src/openai/iflow-core.js';

async function debugResponseStructure() {
    console.log('=== Debugging iFlow Response Structure ===\n');

    const service = new IFlowApiService({});
    await service.initialize();

    // Test non-streaming
    const request = {
        model: 'qwen3-coder-plus',
        messages: [{ role: 'user', content: 'Say exactly: test' }],
        stream: false
    };

    console.log('Making API call...');
    const response = await service.generateContent('qwen3-coder-plus', request);

    console.log('\n=== FULL RESPONSE STRUCTURE ===');
    console.log(JSON.stringify(response, null, 2));

    console.log('\n=== CHECKING CONTENT EXTRACTION ===');
    console.log('response.choices exists:', !!response.choices);
    console.log('response.choices is array:', Array.isArray(response.choices));
    console.log('response.choices.length:', response.choices?.length);
    console.log('response.choices[0]:', JSON.stringify(response.choices?.[0], null, 2));
    console.log('response.choices[0].message:', JSON.stringify(response.choices?.[0]?.message, null, 2));
    console.log('response.choices[0].message.content:', response.choices?.[0]?.message?.content);

    console.log('\n=== TESTING EXTRACTION LOGIC ===');
    // Simulate the extraction logic from openai-strategy.js
    let extracted = '';
    if (response.choices && response.choices.length > 0) {
        const choice = response.choices[0];
        if (choice.message && choice.message.content) {
            extracted = choice.message.content;
        } else if (choice.delta && choice.delta.content) {
            extracted = choice.delta.content;
        }
    }
    console.log('Extracted content:', extracted);
    console.log('Extraction successful:', extracted.length > 0);
}

debugResponseStructure().catch(console.error);
