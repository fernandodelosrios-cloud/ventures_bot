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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'BD SERVICIOS'!A:Z?key=${GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.values || data.values.length < 2) {
      console.log('No data in sheet');
      return [];
    }
    
    const headers = data.values[0];
    const rows = data.values.slice(1);
    
    const headerIndices = {};
    headers.forEach((header, idx) => {
      headerIndices[header ? header.trim() : ''] = idx;
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
  try {
    const data = await getSheetData();
    
    if (data.length === 0) {
      return '📊 No hay datos disponibles en Google Sheet aún.';
    }

    const totalSales = data.reduce((sum, row) => sum + (row.valor || 0), 0);
    const totalMargin = data.reduce((sum, row) => sum + (row.margen || 0), 0);
    const avgMargin = totalMargin / data.length;
    
    const b2b = data.filter(row => row.tipo_cliente === 'Empresa').length;
    const b2c = data.filter(row => row.tipo_cliente === 'Hogar').length;
    
    return `📊 RESUMEN VENTAS TE.SOLUCIONA\n\n💰 Total: S/${totalSales.toFixed(2)}\n📈 Margen: S/${totalMargin.toFixed(2)}\n👥 B2B: ${b2b} | B2C: ${b2c}\n📊 Total servicios: ${data.length}`;
  } catch (error) {
    console.error('Error in generateAnalytics:', error);
    return '❌ Error generando análisis';
  }
}

async function getClaudeResponse(userMessage, userId) {
  if (!userContexts[userId]) {
    userContexts[userId] = [];
  }

  let data = await getSheetData();
  
  // Try to extract year and month from message
  const yearMatch = userMessage.match(/202[0-9]|202\d/);
  const monthMatch = userMessage.match(/enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2}/i);
  
  const monthNames = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  };
  
  let filteredData = data;
  let periodInfo = '';
  
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    filteredData = data.filter(row => {
      if (!row.fecha) return false;
      const parts = row.fecha.split('/');
      if (parts.length === 3) {
        const rowYear = parseInt(parts[2]);
        return rowYear === year;
      }
      return false;
    });
    periodInfo = `Año ${year}`;
    
    if (monthMatch) {
      const monthStr = monthMatch[0].toLowerCase();
      const monthNum = monthNames[monthStr] || parseInt(monthStr);
      if (monthNum) {
        filteredData = filteredData.filter(row => {
          if (!row.fecha) return false;
          const parts = row.fecha.split('/');
          if (parts.length === 3) {
            const rowMonth = parseInt(parts[1]);
            return rowMonth === monthNum;
          }
          return false;
        });
        periodInfo = `${monthMatch[0]} ${year}`;
      }
    }
  }
  
  const totalSales = filteredData.reduce((sum, row) => sum + (row.valor || 0), 0);
  const totalMargin = filteredData.reduce((sum, row) => sum + (row.margen || 0), 0);
  const b2b = filteredData.filter(row => row.tipo_cliente === 'Empresa').length;
  const b2c = filteredData.filter(row => row.tipo_cliente === 'Hogar').length;
  
  const analytics = `📊 ${periodInfo || 'GENERAL'}\nTotal: S/${totalSales.toFixed(2)}\nServicios: ${filteredData.length}\nB2B: ${b2b} | B2C: ${b2c}\nMargen: S/${totalMargin.toFixed(2)}`;
  
  const systemPrompt = `Eres asistente de te.soluciona (limpieza Lima).
Datos solicitados: ${analytics}
Responde en español, sé conciso.`;
  
  userContexts[userId].push({ role: 'user', content: userMessage });
  
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
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
    console.error('Claude error:', error);
    return '❌ Error';
  }
}
