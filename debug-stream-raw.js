// Debug raw streaming data from iFlow API
import axios from 'axios';
import { promises as fs } from 'fs';
import * as http from 'http';
import * as https from 'https';

async function debugRawStream() {
    console.log('=== Debugging Raw Stream Data ===\n');

    // Read API key
    const credsContent = await fs.readFile('C:\\Users\\shinm\\.iflow\\oauth_creds.json', 'utf-8');
    const creds = JSON.parse(credsContent);
    const apiKey = creds.api_key;

    console.log('API Key:', apiKey.substring(0, 10) + '...\n');

    const httpAgent = new http.Agent({
        keepAlive: true,
        maxSockets: 100,
        timeout: 120000,
    });
    const httpsAgent = new https.Agent({
        keepAlive: true,
        maxSockets: 100,
        timeout: 120000,
    });

    const axiosInstance = axios.create({
        baseURL: 'https://apis.iflow.cn/v1',
        httpAgent,
        httpsAgent,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'User-Agent': 'iFlow-Cli',
            'Accept': 'text/event-stream',
        },
        proxy: false,
    });

    const requestBody = {
        model: 'qwen3-coder-plus',
        messages: [{ role: 'user', content: 'Count to 3' }],
        stream: true
    };

    console.log('Making streaming request...\n');

    try {
        const response = await axiosInstance.post('/chat/completions', requestBody, {
            responseType: 'stream'
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        console.log('\n=== RAW STREAM DATA ===\n');

        let buffer = '';
        let chunkIndex = 0;

        response.data.on('data', (chunk) => {
            const chunkStr = chunk.toString();
            console.log(`\n--- Chunk ${++chunkIndex} (${chunk.length} bytes) ---`);
            console.log('Raw:', JSON.stringify(chunkStr));
            console.log('Visible:', chunkStr);

            buffer += chunkStr;
        });

        response.data.on('end', () => {
            console.log('\n\n=== STREAM ENDED ===');
            console.log('Total chunks received:', chunkIndex);
            console.log('Buffer length:', buffer.length);
            console.log('\nFull buffer:\n', buffer);
        });

        response.data.on('error', (err) => {
            console.error('Stream error:', err);
        });

    } catch (error) {
        console.error('Request error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

debugRawStream().catch(console.error);
