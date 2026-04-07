import TelegramBot from 'node-telegram-bot-api';
import Anthropic from '@anthropic-ai/sdk';

const token = '8639089557:AAEvjmjO1dqJrXUpgumpuLIFS9aprOJdk5E';
const bot = new TelegramBot(token, { polling: true });
const client = new Anthropic();

const userContexts = {};

async function getClaudeResponse(userMessage, userId) {
  if (!userContexts[userId]) {
    userContexts[userId] = [];
  }

  const systemPrompt = `You are an AI business assistant for te.soluciona, a cleaning company in Lima, Peru. 
Analyze sales data and provide insights on revenue, margins, and performance. 
Respond in Spanish. Be helpful and concise.`;
  
  userContexts[userId].push({ role: 'user', content: userMessage });
  
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: userContexts[userId]
    });
    
    const assistantMessage = response.content[0].text;
    userContexts[userId].push({ role: 'assistant', content: assistantMessage });
    
    if (userContexts[userId].length > 20) {
      userContexts[userId] = userContexts[userId].slice(-20);
    }
    
    return assistantMessage;
  } catch (error) {
    console.error('Claude API error:', error);
    return 'Error procesando tu solicitud. Intenta de nuevo.';
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '¡Hola! 👋 Soy tu asistente de te.soluciona.\n\nPuedo ayudarte con:\n• Preguntas sobre ventas\n• Análisis de márgenes\n• Comparación B2B vs B2C\n• Información sobre servicios\n\n¿Qué necesitas hoy?');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText.startsWith('/')) return;

  bot.sendChatAction(chatId, 'typing');
  const response = await getClaudeResponse(messageText, chatId);
  bot.sendMessage(chatId, response);
});

bot.on('error', (error) => {
  console.error('Telegram bot error:', error);
});

console.log('te.soluciona Telegram bot is running...');
