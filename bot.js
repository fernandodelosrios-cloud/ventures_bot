import TelegramBot from 'node-telegram-bot-api';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import Anthropic from '@anthropic-ai/sdk';

const token = '8639089557:AAEvjmjO1dqJrXUpgumpuLIFS9aprOJdk5E';
const bot = new TelegramBot(token, { polling: true });
const client = new Anthropic();

const userContexts = {};
const SHEET_ID = '1GIJl4B_ymZik3WRzu_fWqg0SyEOVk9r9Fhss5Y8BMHw';

async function getSheetData() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth(credentials);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    return rows.map(row => ({
      fecha: row.get('FECHA') || row.get('Fecha'),
  cliente: row.get('CLIENTE') || row.get('Cliente'),
  tipo_cliente: row.get('TIPO CLIENTE') || row.get('Tipo Cliente'),
  servicio: row.get('TIPO DE SERVICIO') || row.get('Tipo de Servicio'),
  valor: parseFloat(row.get('VALOR') || 0),
  margen: parseFloat(row.get('MARGEN') || 0),
    }));
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    return [];
  }
}

async function generateAnalytics(period = 'weekly') {
  const data = await getSheetData();
  if (data.length === 0) {
    return 'No data available yet.';
  }
  const totalSales = data.reduce((sum, row) => sum + row.valor, 0);
  const totalMargin = data.reduce((sum, row) => sum + row.margen, 0);
  const avgMargin = data.length > 0 ? (totalMargin / data.length).toFixed(2) : 0;
  const b2b = data.filter(row => row.tipo_cliente === 'EMPRESA');
  const b2c = data.filter(row => row.tipo_cliente === 'HOGAR');
  const b2bSales = b2b.reduce((sum, row) => sum + row.valor, 0);
  const b2cSales = b2c.reduce((sum, row) => sum + row.valor, 0);
  const deepCleaning = data.filter(row => row.servicio && row.servicio.includes('PROFUNDA'));
  const otherServices = data.filter(row => !row.servicio || !row.servicio.includes('PROFUNDA'));
  const deepCleaningSales = deepCleaning.reduce((sum, row) => sum + row.valor, 0);
  const otherServicesSales = otherServices.reduce((sum, row) => sum + row.valor, 0);
  
  return `📊 te.soluciona ${period.toUpperCase()} SUMMARY\n\n💰 Sales Metrics:\n• Total Sales: $${totalSales.toFixed(2)}\n• Total Margin: $${totalMargin.toFixed(2)}\n• Average Margin per Service: $${avgMargin}\n• Services Completed: ${data.length}\n\n👥 Client Type Breakdown:\n• B2B (EMPRESA): $${b2bSales.toFixed(2)} (${((b2bSales/totalSales)*100).toFixed(1)}%)\n• B2C (HOGAR): $${b2cSales.toFixed(2)} (${((b2cSales/totalSales)*100).toFixed(1)}%)\n\n🧹 Service Type Breakdown:\n• Deep Cleaning (PROFUNDA): $${deepCleaningSales.toFixed(2)} (${((deepCleaningSales/totalSales)*100).toFixed(1)}%)\n• Other Services: $${otherServicesSales.toFixed(2)} (${((otherServicesSales/totalSales)*100).toFixed(1)}%)`;
}

async function getClaudeResponse(userMessage, userId) {
  if (!userContexts[userId]) {
    userContexts[userId] = [];
  }
  const sheetData = await getSheetData();
  const systemPrompt = `You are an AI business assistant for te.soluciona, a cleaning company in Lima, Peru. Analyze sales data and provide insights on B2B vs B2C revenue and service performance. Respond in Spanish.`;
  
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
    return 'Error processing your request.';
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '¡Hola! 👋 Soy tu asistente de te.soluciona.\n\nPuedo ayudarte con:\n• /daily - Resumen diario\n• /weekly - Resumen semanal\n• Preguntas sobre ventas, márgenes y clientes\n\n¿Qué necesitas hoy?');
});

bot.onText(/\/daily/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, 'typing');
  const analytics = await generateAnalytics('daily');
  bot.sendMessage(chatId, analytics);
});

bot.onText(/\/weekly/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, 'typing');
  const analytics = await generateAnalytics('weekly');
  bot.sendMessage(chatId, analytics);
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
