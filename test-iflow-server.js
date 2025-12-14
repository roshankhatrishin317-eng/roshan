// Test iFlow through the actual server
import https from 'https';

async function testIFlowThroughServer() {
    console.log('=== Testing iFlow Through Server ===\n');

    // Test 1: Non-streaming request
    console.log('Test 1: Non-streaming request');
    await testNonStreaming();

    console.log('\n');

    // Test 2: Streaming request
    console.log('Test 2: Streaming request');
    await testStreaming();
}

function testNonStreaming() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: 'qwen3-coder-plus',
            messages: [{ role: 'user', content: 'Say exactly "test works"' }],
            stream: false
        });

        const options = {
            hostname: 'localhost',
            port: 3001,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            console.log(`Status: ${res.statusCode}`);

            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    const content = parsed.choices?.[0]?.message?.content;
                    console.log('Content:', content || 'EMPTY!');
                    console.log('Full response:', JSON.stringify(parsed, null, 2));
                    resolve();
                } catch (e) {
                    console.error('Parse error:', e);
                    console.log('Raw body:', body);
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            console.error(`Error: ${e.message}`);
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

function testStreaming() {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            model: 'qwen3-coder-plus',
            messages: [{ role: 'user', content: 'Count to 3' }],
            stream: true
        });

        const options = {
            hostname: 'localhost',
            port: 3001,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            console.log(`Status: ${res.statusCode}`);
            console.log(`Headers:`, res.headers);

            let buffer = '';
            let chunkCount = 0;
            let totalContent = '';

            res.on('data', (chunk) => {
                buffer += chunk.toString();
                chunkCount++;

                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.substring(0, newlineIndex).trim();
                    buffer = buffer.substring(newlineIndex + 1);

                    if (line.startsWith('data: ')) {
                        const jsonData = line.substring(6).trim();
                        if (jsonData === '[DONE]') {
                            console.log('Stream ended');
                            continue;
                        }
                        try {
                            const parsed = JSON.parse(jsonData);
                            const delta = parsed.choices?.[0]?.delta?.content;
                            if (delta) {
                                totalContent += delta;
                                process.stdout.write('.');
                            }
                        } catch (e) {
                            console.error('Parse error:', e, 'Data:', jsonData);
                        }
                    }
                }
            });

            res.on('end', () => {
                console.log('\nTotal chunks:', chunkCount);
                console.log('Content:', totalContent || 'EMPTY!');
                resolve();
            });
        });

        req.on('error', (e) => {
            console.error(`Error: ${e.message}`);
            reject(e);
        });

        req.write(data);
        req.end();
    });
}

testIFlowThroughServer().catch(console.error);
