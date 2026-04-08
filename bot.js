import TelegramBot from 'node-telegram-bot-api';
import Anthropic from '@anthropic-ai/sdk';

const token = '8639089557:AAEvjmjO1dqJrXUpgumpuLIFS9aprOJdk5E';
const bot = new TelegramBot(token, { polling: true });
const client = new Anthropic();

const userContexts = {};
const SHEET_ID = '1GIJl4B_ymZik3WRzu_fWqg0SyEOVk9r9Fhss5Y8BMHw';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function getSheetData() {
  try {
    // Get all values from the sheet
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'BD SERVICIOS'?key=${GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.values || data.values.length < 2) {
      console.log('No data in sheet');
      return [];
    }
    
    const headers = data.values[0];
    const rows = data.values.slice(1);
    
    // Map headers to indices
    const headerIndices = {};
    headers.forEach((header, idx) => {
      headerIndices[header.trim()] = idx;
    });
    
    console.log('Headers:', headers);
    console.log('Total rows:', rows.length);
    
    return rows.map(row => ({
      fecha: row[headerIndices['FECHA']] || '',
      cliente: row[headerIndices['CLIENTE']] || '',
      tipo_cliente: row[headerIndices['TIPO CLIENTE']] || '',
      servicio: row[headerIndices['TIPO DE SERVICIO']] || '',
      valor: parseFloat(row[headerIndices['VALOR']] || 0),
      margen: parseFloat(row[headerIndices['MARGEN']] || 0),
    })).filter(row => row.valor > 0);
  } catch (error) {
    console.error('Error fetching sheet:', error);
    return [];
  }
}

async function generateAnalytics() {
  const data = await getSheetData();
  
  if (data.length === 0) {
    return '📊 No hay datos disponibles en Google Sheet aún.';
  }

  const totalSales = data.reduce((sum, row) => sum + (row.valor || 0), 0);
  const totalMargin = data.reduce((sum, row) => sum + (row.margen || 0), 0);
  const avgMargin = data.length > 0 ? (totalMargin / data.length).toFixed(2) : 0;
  
  const b2b = data.filter(row => row.tipo_cliente === 'Empresa');
  const b2c = data.filter(row => row.tipo_cliente === 'Hogar');
  const b2bSales = b2b.reduce((sum, row) => sum + (row.valor || 0), 0);
  const b2cSales = b2c.reduce((sum, row) => sum + (row.valor || 0), 0);
  
  const deepCleaning = data.filter(row => row.servicio && row.servicio.includes('PROFUNDA'));
  const otherServices = data.filter(row => !row.servicio || !row.servicio.includes('PROFUNDA'));
  const deepCleaningSales = deepCleaning.reduce((sum, row) => sum + (row.valor || 0), 0);
  const otherServicesSales = otherServices.reduce((sum, row) => sum + (row.valor || 0), 0);
  
  return `📊 RESUMEN DE VENTAS\n\n💰 Ventas Totales: S/${totalSales.toFixed(2)}\nMárgen Total: S/${totalMargin.toFixed(2)}\nMárgen Promedio: S/${avgMargin}\n\n👥 B2B vs B2C:\nB2B (Empresa): S/${b2bSales.toFixed(2)} (${b2bSales > 0 ? ((b2bSales/totalSales)*100).toFixed(1) : 0}%)\nB2C (Hogar): S/${b2cSales.toFixed(2)} (${b2cSales > 0 ? ((b2cSales/totalSales)*100).toFixed(1) : 0}%)\n\n🧹 Limpieza Profunda vs Otros:\nProfunda: S/${deepCleaningSales.toFixed(2)} (${deepCleaningSales > 0 ? ((deepCleaningSales/totalSales)*100).toFixed(1) : 0}%)\nOtros: S/${otherServicesSales.toFixed(2)} (${otherServicesSales > 0 ? ((otherServicesSales/totalSales)*100).toFixed(1) : 0}%)`;
}

async function getClaudeResponse(userMessage, userId) {
  if (!userContexts[userId]) {
    userContexts[userId] = [];
  }

  const analytics = await generateAnalytics();
  
  const systemPrompt = `You are an AI business assistant for te.soluciona, a cleaning company in Lima, Peru. 
You have access to real sales data from their Google Sheet.
Analyze sales data and provide insights on revenue, margins, B2B vs B2C, and service performance.
Respond in Spanish. Be helpful and concise.

Current analytics:
${analytics}`;
  
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
  bot.sendMessage(chatId, '¡Hola! 👋 Soy tu asistente de te.soluciona.\n\nPuedo ayudarte con:\n• /daily - Resumen diario\n• /weekly - Resumen semanal\n• Preguntas sobre ventas, márgenes y clientes\n\n¿Qué necesitas hoy?');
});

bot.onText(/\/daily/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, 'typing');
  const analytics = await generateAnalytics();
  bot.sendMessage(chatId, analytics);
});

bot.onText(/\/weekly/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, 'typing');
  const analytics = await generateAnalytics();
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

console.log('te.soluciona Telegram bot is running with Google Sheets API...');
