/**
 * 转换器注册模块
 * 用于注册所有转换器到工厂，避免循环依赖问题
 * 
 * 注意：使用字符串字面量而非从 common.js 导入，以避免循环依赖
 */

import { ConverterFactory } from './ConverterFactory.js';
import { OpenAIConverter } from './strategies/OpenAIConverter.js';
import { OpenAIResponsesConverter } from './strategies/OpenAIResponsesConverter.js';
import { ClaudeConverter } from './strategies/ClaudeConverter.js';
import { GeminiConverter } from './strategies/GeminiConverter.js';
import { OllamaConverter } from './strategies/OllamaConverter.js';

// Protocol prefixes (matching MODEL_PROTOCOL_PREFIX in common.js)
const PROTOCOLS = {
    OPENAI: 'openai',
    OPENAI_RESPONSES: 'openaiResponses',
    CLAUDE: 'claude',
    GEMINI: 'gemini',
    OLLAMA: 'ollama',
};

/**
 * 注册所有转换器到工厂
 * 此函数应在应用启动时调用一次
 */
export function registerAllConverters() {
    ConverterFactory.registerConverter(PROTOCOLS.OPENAI, OpenAIConverter);
    ConverterFactory.registerConverter(PROTOCOLS.OPENAI_RESPONSES, OpenAIResponsesConverter);
    ConverterFactory.registerConverter(PROTOCOLS.CLAUDE, ClaudeConverter);
    ConverterFactory.registerConverter(PROTOCOLS.GEMINI, GeminiConverter);
    ConverterFactory.registerConverter(PROTOCOLS.OLLAMA, OllamaConverter);
}

// 自动注册所有转换器
registerAllConverters();