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
  
  // Group by year and month
  const salesByYearMonth = {};
  data.forEach(row => {
    if (row.fecha) {
      const dateParts = row.fecha.split('/');
      if (dateParts.length >= 3) {
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]);
        const year = parseInt(dateParts[2]);
        
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          const key = `${year}-${String(month).padStart(2, '0')}`;
          if (!salesByYearMonth[key]) {
            salesByYearMonth[key] = { sales: 0, margin: 0, count: 0 };
          }
          salesByYearMonth[key].sales += row.valor || 0;
          salesByYearMonth[key].margin += row.margen || 0;
          salesByYearMonth[key].count += 1;
        }
      }
    }
  });
  
  const yearMonthSummary = Object.entries(salesByYearMonth)
    .sort()
    .reverse()
    .slice(0, 12)
    .map(([key, data]) => `${key}: $${data.sales.toFixed(2)} (${data.count} servicios)`)
    .join('\n');
  
  const b2b = data.filter(row => row.tipo_cliente === 'Empresa');
  const b2c = data.filter(row => row.tipo_cliente === 'Hogar');
  const b2bSales = b2b.reduce((sum, row) => sum + (row.valor || 0), 0);
  const b2cSales = b2c.reduce((sum, row) => sum + (row.valor || 0), 0);
  
  const deepCleaning = data.filter(row => row.servicio && row.servicio.includes('PROFUNDA'));
  const otherServices = data.filter(row => !row.servicio || !row.servicio.includes('PROFUNDA'));
  const deepCleaningSales = deepCleaning.reduce((sum, row) => sum + (row.valor || 0), 0);
  const otherServicesSales = otherServices.reduce((sum, row) => sum + (row.valor || 0), 0);
  
  return `📊 RESUMEN DE VENTAS - te.soluciona

💰 TOTALES:
Ventas Totales: S/${totalSales.toFixed(2)}
Márgen Total: S/${totalMargin.toFixed(2)}
Márgen Promedio: S/${avgMargin}
Total de Servicios: ${data.length}

📅 VENTAS POR MES (últimos 12 meses):
${yearMonthSummary}

👥 B2B vs B2C:
B2B (Empresa): S/${b2bSales.toFixed(2)} (${b2bSales > 0 ? ((b2bSales/totalSales)*100).toFixed(1) : 0}%)
B2C (Hogar): S/${b2cSales.toFixed(2)} (${b2cSales > 0 ? ((b2cSales/totalSales)*100).toFixed(1) : 0}%)

🧹 LIMPIEZA PROFUNDA vs OTROS:
Profunda: S/${deepCleaningSales.toFixed(2)} (${deepCleaningSales > 0 ? ((deepCleaningSales/totalSales)*100).toFixed(1) : 0}%)
Otros: S/${otherServicesSales.toFixed(2)} (${otherServicesSales > 0 ? ((otherServicesSales/totalSales)*100).toFixed(1) : 0}%)`;
}
