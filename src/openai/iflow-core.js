import axios from 'axios';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as os from 'os';
import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';
import { getProviderModels } from '../provider-models.js';

// --- Constants ---
const IFLOW_DIR = '.iflow';
const IFLOW_CREDENTIAL_FILENAME = 'oauth_creds.json';

// iFlow OAuth endpoints (from CLIProxyAPI reference)
const IFLOW_OAUTH_TOKEN_ENDPOINT = 'https://iflow.cn/oauth/token';
const IFLOW_OAUTH_AUTHORIZE_ENDPOINT = 'https://iflow.cn/oauth';
const IFLOW_USER_INFO_ENDPOINT = 'https://iflow.cn/api/oauth/getUserInfo';
const IFLOW_SUCCESS_REDIRECT_URL = 'https://iflow.cn/oauth/success';
const IFLOW_API_KEY_ENDPOINT = 'https://platform.iflow.cn/api/openapi/apikey';

// OAuth client credentials (from CLIProxyAPI reference)
const IFLOW_OAUTH_CLIENT_ID = '10009311001';
const IFLOW_OAUTH_CLIENT_SECRET = '4Z3YjXycVsQvyGF1etiNlIBB4RsqSDtW';

// Default API base URL
const DEFAULT_IFLOW_BASE_URL = 'https://apis.iflow.cn/v1';

// OAuth callback port
const IFLOW_OAUTH_CALLBACK_PORT = 11451;

// Token refresh buffer (48 hours before expiry)
const TOKEN_REFRESH_BUFFER_MS = 48 * 60 * 60 * 1000;

// Get models from provider-models.js
const IFLOW_MODELS = getProviderModels('openai-iflow-oauth');
const IFLOW_MODEL_LIST = IFLOW_MODELS.map(id => ({
    id: id,
    name: id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}));

export const IFlowOAuth2Event = {
    AuthUri: 'auth-uri',
    AuthProgress: 'auth-progress',
    AuthCancel: 'auth-cancel',
};
export const iflowOAuth2Events = new EventEmitter();

// --- Helper Functions ---

/**
 * Extract BXAuth cookie value from cookie string
 * @param {string} cookie - Full cookie string
 * @returns {string} BXAuth value or empty string
 */
function extractBXAuth(cookie) {
    if (!cookie) return '';
    const match = cookie.match(/BXAuth=([^;]+)/);
    return match ? match[1] : '';
}

/**
 * Check if API key needs refresh (within 48 hours of expiry)
 * @param {string} expireTime - Expiry time string (format: "YYYY-MM-DD HH:mm")
 * @returns {{needsRefresh: boolean, timeUntilExpiry: number}}
 */
function shouldRefreshAPIKey(expireTime) {
    if (!expireTime || typeof expireTime !== 'string') {
        return { needsRefresh: false, timeUntilExpiry: 0 };
    }

    try {
        const expire = new Date(expireTime.replace(' ', 'T'));
        const now = new Date();
        const twoDaysFromNow = new Date(now.getTime() + TOKEN_REFRESH_BUFFER_MS);

        const needsRefresh = expire <= twoDaysFromNow;
        const timeUntilExpiry = expire.getTime() - now.getTime();

        return { needsRefresh, timeUntilExpiry };
    } catch (error) {
        console.warn('[iFlow] Failed to parse expire time:', error);
        return { needsRefresh: false, timeUntilExpiry: 0 };
    }
}

// --- Core Service Class ---

export class IFlowApiService {
    constructor(config) {
        this.config = config;
        this.isInitialized = false;
        this.credentials = null;
        this.currentAxiosInstance = null;
        this.useSystemProxy = config?.USE_SYSTEM_PROXY_IFLOW ?? false;
        console.log(`[iFlow] System proxy ${this.useSystemProxy ? 'enabled' : 'disabled'}`);

        // Support Base64 encoded credentials (like Kiro)
        if (config?.IFLOW_OAUTH_CREDS_BASE64) {
            try {
                const decodedCreds = Buffer.from(config.IFLOW_OAUTH_CREDS_BASE64, 'base64').toString('utf8');
                const parsedCreds = JSON.parse(decodedCreds);
                this.base64Creds = parsedCreds;
                console.info('[iFlow] Successfully decoded Base64 credentials in constructor.');
            } catch (error) {
                console.error(`[iFlow] Failed to parse Base64 credentials in constructor: ${error.message}`);
            }
        }
    }

    async initialize() {
        if (this.isInitialized) return;
        console.log('[iFlow] Initializing iFlow API Service...');

        await this._initializeAuth();

        // Configure HTTP/HTTPS agents
        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 5,
            timeout: 120000,
        });
        const httpsAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 100,
            maxFreeSockets: 5,
            timeout: 120000,
        });

        const axiosConfig = {
            baseURL: DEFAULT_IFLOW_BASE_URL,
            httpAgent,
            httpsAgent,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'iFlow-Cli',
            },
        };

        if (!this.useSystemProxy) {
            axiosConfig.proxy = false;
        }

        this.currentAxiosInstance = axios.create(axiosConfig);
        this.isInitialized = true;
        console.log('[iFlow] Initialization complete.');
    }

    async _initializeAuth(forceRefresh = false) {
        try {
            // Priority 1: Use Base64 credentials if available (like Kiro)
            if (this.base64Creds) {
                console.log('[iFlow] Using Base64 credentials...');
                this.credentials = this.base64Creds;
                this.base64Creds = null; // Clear after use

                // If Base64 credentials have api_key, use directly without refresh
                if (this.credentials.api_key) {
                    // Check if we need to refresh based on expiry
                    if (forceRefresh || this._shouldRefreshCredentials()) {
                        console.log('[iFlow] Base64 credentials need refresh...');
                        try {
                            await this._refreshCredentials();
                        } catch (refreshError) {
                            // If refresh fails but we have api_key, continue with existing credentials
                            if (this.credentials.api_key) {
                                console.warn('[iFlow] Refresh failed, but api_key exists. Using existing credentials.');
                            } else {
                                throw refreshError;
                            }
                        }
                    } else {
                        console.log('[iFlow] Using Base64 credentials directly.');
                    }
                    return;
                }

                // No api_key in Base64 creds, try to refresh
                if (this.credentials.refresh_token) {
                    console.log('[iFlow] Base64 credentials missing api_key, attempting refresh...');
                    await this._refreshCredentials();
                    return;
                }
            }

            // Priority 2: Try to load cached credentials from file
            const cached = await this._loadCachedCredentials();

            if (cached) {
                this.credentials = cached;

                // Check if we need to refresh
                if (forceRefresh || this._shouldRefreshCredentials()) {
                    console.log('[iFlow] Credentials need refresh...');
                    try {
                        await this._refreshCredentials();
                    } catch (refreshError) {
                        // If refresh fails but we have api_key, continue with existing credentials
                        if (this.credentials.api_key) {
                            console.warn('[iFlow] Refresh failed, but api_key exists. Using existing credentials.');
                        } else {
                            throw refreshError;
                        }
                    }
                } else {
                    console.log('[iFlow] Using cached credentials.');
                }
                return;
            }

            // No cached credentials - need OAuth flow
            console.log('[iFlow] No cached credentials found. OAuth authentication');
            throw new Error('iFlow OAuth authentication required. Please run the OAuth flow first.');

        } catch (error) {
            console.error('[iFlow] Auth initialization failed:', error.message);
            throw error;
        }
    }

    _shouldRefreshCredentials() {
        if (!this.credentials) return true;

        // Check OAuth token expiry
        if (this.credentials.expiry_date) {
            const now = Date.now();
            if (now >= this.credentials.expiry_date - TOKEN_REFRESH_BUFFER_MS) {
                return true;
            }
        }

        // Check API key expiry (for cookie-based auth)
        if (this.credentials.expire) {
            const { needsRefresh } = shouldRefreshAPIKey(this.credentials.expire);
            if (needsRefresh) return true;
        }

        return false;
    }

    async _refreshCredentials() {
        if (!this.credentials) {
            throw new Error('No credentials to refresh');
        }

        // Cookie-based refresh
        if (this.credentials.cookie && this.credentials.email) {
            console.log('[iFlow] Refreshing cookie-based API key...');
            await this._refreshCookieBasedAPIKey();
            return;
        }

        // OAuth-based refresh
        if (this.credentials.refresh_token) {
            console.log('[iFlow] Refreshing OAuth tokens...');
            await this._refreshOAuthTokens();
            return;
        }

        throw new Error('No valid refresh method available');
    }

    async _refreshOAuthTokens() {
        const form = new URLSearchParams();
        form.append('grant_type', 'refresh_token');
        form.append('refresh_token', this.credentials.refresh_token);
        form.append('client_id', IFLOW_OAUTH_CLIENT_ID);
        form.append('client_secret', IFLOW_OAUTH_CLIENT_SECRET);

        const basicAuth = Buffer.from(`${IFLOW_OAUTH_CLIENT_ID}:${IFLOW_OAUTH_CLIENT_SECRET}`).toString('base64');

        try {
            const response = await fetch(IFLOW_OAUTH_TOKEN_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': `Basic ${basicAuth}`,
                },
                body: form.toString(),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
            }

            const tokenData = await response.json();

            if (!tokenData.access_token) {
                throw new Error('No access token in refresh response');
            }

            // Fetch user info to get API key
            const userInfo = await this._fetchUserInfo(tokenData.access_token);

            // Update credentials
            this.credentials = {
                ...this.credentials,
                access_token: tokenData.access_token,
                refresh_token: tokenData.refresh_token || this.credentials.refresh_token,
                api_key: userInfo.apiKey,
                email: userInfo.email || userInfo.phone,
                expiry_date: Date.now() + (tokenData.expires_in * 1000),
                token_type: tokenData.token_type,
                scope: tokenData.scope,
            };
            await this._cacheCredentials(this.credentials);
            console.log('[iFlow] OAuth tokens refreshed successfully.');

        } catch (error) {
            console.error('[iFlow] OAuth token refresh failed:', error);
            throw error;
        }
    }

    async _refreshCookieBasedAPIKey() {
        const cookie = this.credentials.cookie;
        const name = this.credentials.email;

        if (!cookie || !name) {
            throw new Error('Missing cookie or email for cookie-based refresh');
        }

        try {
            // POST request to refresh API key
            const response = await fetch(IFLOW_API_KEY_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Cookie': cookie,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Origin': 'https://platform.iflow.cn',
                    'Referer': 'https://platform.iflow.cn/',
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API key refresh failed: ${response.status} ${errorText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(`API key refresh not successful: ${result.message}`);
            }

            // Update credentials
            this.credentials = {
                ...this.credentials,
                api_key: result.data.apiKey,
                expire: result.data.expireTime,
            };

            await this._cacheCredentials(this.credentials);
            console.log(`[iFlow] Cookie-based API key refreshed. New expiry: ${result.data.expireTime}`);

        } catch (error) {
            console.error('[iFlow] Cookie-based API key refresh failed:', error);
            throw error;
        }
    }

    async _fetchUserInfo(accessToken) {
        const url = `${IFLOW_USER_INFO_ENDPOINT}?accessToken=${encodeURIComponent(accessToken)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch user info: ${response.status} ${errorText}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error('User info request not successful');
        }

        return result.data;
    }

    _getCredentialPath() {
        if (this.config && this.config.IFLOW_OAUTH_CREDS_FILE_PATH) {
            let filePath = this.config.IFLOW_OAUTH_CREDS_FILE_PATH;
            // Expand ~ to home directory
            if (filePath.startsWith('~')) {
                filePath = path.join(os.homedir(), filePath.slice(1));
            }
            return path.resolve(filePath);
        }
        return path.join(os.homedir(), IFLOW_DIR, IFLOW_CREDENTIAL_FILENAME);
    }

    async _loadCachedCredentials() {
        try {
            const credPath = this._getCredentialPath();
            const content = await fs.readFile(credPath, 'utf-8');
            const credentials = JSON.parse(content);

            // Validate that we have an API key
            if (!credentials.api_key) {
                console.warn('[iFlow] Cached credentials missing API key');
                return null;
            }

            return credentials;
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.warn('[iFlow] Failed to load cached credentials:', error.message);
            }
            return null;
        }
    }

    async _cacheCredentials(credentials) {
        const credPath = this._getCredentialPath();
        await fs.mkdir(path.dirname(credPath), { recursive: true });
        await fs.writeFile(credPath, JSON.stringify(credentials, null, 2));
        console.log(`[iFlow] Credentials cached to ${credPath}`);
    }

    getApiKey() {
        return this.credentials?.api_key || '';
    }

    isAuthError(error) {
        if (!error) return false;
        const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();
        const errorCode = error?.status || error?.code || error.response?.status;

        const code = String(errorCode);
        return (
            code.startsWith('401') || code.startsWith('403') ||
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('forbidden') ||
            errorMessage.includes('invalid api key') ||
            errorMessage.includes('invalid access token') ||
            errorMessage.includes('token expired') ||
            errorMessage.includes('authentication') ||
            errorMessage.includes('access denied')
        );
    }

    async callApiWithAuthAndRetry(endpoint, body, isStream = false, retryCount = 0) {
        const maxRetries = (this.config && this.config.REQUEST_MAX_RETRIES) || 3;
        const baseDelay = (this.config && this.config.REQUEST_BASE_DELAY) || 1000;

        try {
            const apiKey = this.getApiKey();
            if (!apiKey) {
                throw new Error('No API key available. Please authenticate first.');
            }

            // Configure HTTP/HTTPS agents
            const httpAgent = new http.Agent({
                keepAlive: true,
                maxSockets: 100,
                maxFreeSockets: 5,
                timeout: 120000,
            });
            const httpsAgent = new https.Agent({
                keepAlive: true,
                maxSockets: 100,
                maxFreeSockets: 5,
                timeout: 120000,
            });

            const axiosConfig = {
                baseURL: DEFAULT_IFLOW_BASE_URL,
                httpAgent,
                httpsAgent,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'User-Agent': 'iFlow-Cli',
                    'Accept': isStream ? 'text/event-stream' : 'application/json',
                },
            };

            if (!this.useSystemProxy) {
                axiosConfig.proxy = false;
            }

            this.currentAxiosInstance = axios.create(axiosConfig);

            // Validate model
            const processedBody = { ...body };
            if (processedBody.model && IFLOW_MODEL_LIST.length > 0 &&
                !IFLOW_MODEL_LIST.some(model => model.id === processedBody.model)) {
                console.warn(`[iFlow] Model '${processedBody.model}' not in predefined list. Using as-is.`);
            }

            const requestBody = isStream ? { ...processedBody, stream: true } : processedBody;
            const options = isStream ? { responseType: 'stream' } : {};
            const response = await this.currentAxiosInstance.post(endpoint, requestBody, options);
            return response.data;

        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data || error.message;

            if (this.isAuthError(error) && retryCount === 0) {
                console.warn(`[iFlow] Auth error (${status}). Refreshing credentials...`);
                try {
                    await this._initializeAuth(true);
                    return this.callApiWithAuthAndRetry(endpoint, body, isStream, retryCount + 1);
                } catch (refreshError) {
                    console.error(`[iFlow] Credential refresh failed:`, refreshError);
                    throw new Error(`Credential refresh failed. Please re-authenticate. ${refreshError.message}`);
                }
            }

            if ((status === 429 || (status >= 500 && status < 600)) && retryCount < maxRetries) {
                const delay = baseDelay * Math.pow(2, retryCount);
                console.log(`[iFlow] Status ${status}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.callApiWithAuthAndRetry(endpoint, body, isStream, retryCount + 1);
            }

            console.error(`Error calling iFlow API (Status: ${status}):`, data);
            throw error;
        }
    }

    async generateContent(model, requestBody) {
        return this.callApiWithAuthAndRetry('/chat/completions', requestBody, false);
    }

    async *generateContentStream(model, requestBody) {
        const stream = await this.callApiWithAuthAndRetry('/chat/completions', requestBody, true);
        let buffer = '';
        for await (const chunk of stream) {
            buffer += chunk.toString();

            // Process complete SSE messages (terminated by \n\n)
            let doubleNewlineIndex;
            while ((doubleNewlineIndex = buffer.indexOf('\n\n')) !== -1) {
                const message = buffer.substring(0, doubleNewlineIndex).trim();
                buffer = buffer.substring(doubleNewlineIndex + 2);

                // Skip empty messages
                if (!message) continue;

                // Parse SSE format: "data: {...}"
                if (message.startsWith('data:')) {
                    const jsonData = message.substring(5).trim();
                    if (jsonData === '[DONE]') return;

                    try {
                        const parsed = JSON.parse(jsonData);
                        yield parsed;
                    } catch (e) {
                        console.warn("[iFlow] Failed to parse stream chunk:", jsonData);
                    }
                } else if (message.startsWith('data: ')) {
                    const jsonData = message.substring(6).trim();
                    if (jsonData === '[DONE]') return;

                    try {
                        const parsed = JSON.parse(jsonData);
                        yield parsed;
                    } catch (e) {
                        console.warn("[iFlow] Failed to parse stream chunk:", jsonData);
                    }
                }
            }
        }
    }

    async listModels() {
        return {
            data: IFLOW_MODEL_LIST
        };
    }

    isExpiryDateNear() {
        try {
            if (!this.credentials) return false;

            // Check OAuth expiry
            if (this.credentials.expiry_date) {
                const currentTime = Date.now();
                const cronNearMinutesInMillis = (this.config?.CRON_NEAR_MINUTES || 10) * 60 * 1000;
                if (this.credentials.expiry_date <= (currentTime + cronNearMinutesInMillis)) {
                    return true;
                }
            }

            // Check API key expiry (cookie-based)
            if (this.credentials.expire) {
                const { needsRefresh } = shouldRefreshAPIKey(this.credentials.expire);
                return needsRefresh;
            }

            return false;
        } catch (error) {
            console.error(`[iFlow] Error checking expiry date: ${error.message}`);
            return false;
        }
    }
}

// Export constants for OAuth handler
export {
    IFLOW_OAUTH_TOKEN_ENDPOINT,
    IFLOW_OAUTH_AUTHORIZE_ENDPOINT,
    IFLOW_USER_INFO_ENDPOINT,
    IFLOW_SUCCESS_REDIRECT_URL,
    IFLOW_API_KEY_ENDPOINT,
    IFLOW_OAUTH_CLIENT_ID,
    IFLOW_OAUTH_CLIENT_SECRET,
    IFLOW_OAUTH_CALLBACK_PORT,
    IFLOW_DIR,
    IFLOW_CREDENTIAL_FILENAME,
    extractBXAuth,
    shouldRefreshAPIKey,
};
