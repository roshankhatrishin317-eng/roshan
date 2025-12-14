// Test iFlow API directly
import https from 'https';

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
        // Read API key from credentials file
        'Authorization': 'Bearer ' + (await import('fs')).promises.readFile('C:\\Users\\shinm\\.iflow\\oauth_creds.json', 'utf-8').then(d => JSON.parse(d).api_key),
        'User-Agent': 'iFlow-Cli',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });
    res.on('end', () => {
        console.log('Response:', body);
    });
});

req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
});

req.write(data);
req.end();
