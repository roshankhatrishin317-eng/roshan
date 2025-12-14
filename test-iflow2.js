// Test iFlow API directly with credentials from file
import https from 'https';
import { promises as fs } from 'fs';

async function testIFlow() {
    // Read API key from credentials file
    const credsContent = await fs.readFile('C:\\Users\\shinm\\.iflow\\oauth_creds.json', 'utf-8');
    const creds = JSON.parse(credsContent);
    const apiKey = creds.api_key;
    
    console.log('Using API key:', apiKey.substring(0, 10) + '...');
    
    const data = JSON.stringify({
        model: 'qwen3-coder-plus',
        messages: [{ role: 'user', content: 'hi' }],
        stream: false
    });

    const options = {
        hostname: 'apis.iflow.cn',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'iFlow-Cli',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            console.log(`Status: ${res.statusCode}`);
            
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                console.log('Response:', body);
                resolve(body);
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

testIFlow().catch(console.error);
