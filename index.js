import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

const app = express();
dotenv.config();

// Configurar el pool de conexiones nativo de PostgreSQL
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Inicializar Prisma
const prisma = new PrismaClient({ adapter });

app.use(cors({
  origin: process.env.FRONTEND_URL || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API de Hapi Tracker funcionando correctamente');
});

// ============ OBTENER TRANSACCIONES ============
app.get('/api/trades', async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      orderBy: { tradeDate: 'desc' }
    });
    res.json(trades);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});

// ============ GUARDAR TRANSACCIÓN ============
app.post('/api/trades', async (req, res) => {
  try {
    const { type, ticker, assetName, amountValue, tradeDate, imageUrl } = req.body;
    
    const newTrade = await prisma.trade.create({
      data: {
        type,
        ticker: ticker.toUpperCase(),
        assetName,
        amountValue: parseFloat(amountValue),
        tradeDate: new Date(tradeDate),
        imageUrl
      },
    });
    res.status(201).json(newTrade);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar la operación' });
  }
});

// ============ OBTENER GASTO POR ID ============
app.get('/api/gastos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const gasto = await prisma.gasto.findUnique({
      where: { id },
      include: {
        categorias: true,
        obra: true,
        usuario: true
      }
    });
    
    if (!gasto) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    
    res.json(gasto);
  } catch (error) {
    console.error('Error al obtener gasto:', error);
    res.status(500).json({ error: 'Error al obtener el gasto' });
  }
});

// ============ ACTUALIZAR OPERACIÓN ============
app.put('/api/trades/:id', async (req, res) => {
  console.log('=== 📥 PETICIÓN PUT RECIBIDA ===');
  console.log('ID recibido en params:', req.params.id);
  console.log('Body recibido:', req.body);

  try {
    const { id } = req.params;
    const { type, ticker, assetName, amountValue, tradeDate, imageUrl } = req.body;

    // 🟢 CORREGIDO: Asignamos el await a la variable updatedTrade
    const updatedTrade = await prisma.trade.update({
      where: { id },
      data: { 
        type, 
        ticker: ticker.toUpperCase(), // Lo aseguramos en mayúsculas también al editar
        assetName, 
        amountValue: parseFloat(amountValue), // Nos aseguramos de que viaje como número decimal
        tradeDate: new Date(tradeDate), 
        imageUrl // <-- Ahora Prisma ya sabrá qué es esto
      }
    });
    
    console.log('=== ✅ ACTUALIZACIÓN EXITOSA EN BD ===');
    res.json(updatedTrade); // Ahora sí tiene qué responder
  } catch (error) {
    console.error('=== ❌ ERROR DENTRO DE PUT ===');
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar la operación' });
  }
});

// ============ ELIMINAR OPERACIÓN (TRADE) ============
app.delete('/api/trades/:id', async (req, res) => {
  try {
    const { id } = req.params; // ❌ SIN parseInt, porque tu ID es un string/UUID
    
    // 1. Verificar si la transacción existe en la tabla trade
    const existingTrade = await prisma.trade.findUnique({
      where: { id: id }
    });
    
    if (!existingTrade) {
      return res.status(404).json({ error: 'Operación no encontrada' });
    }
    
    // 2. Si existe, proceder a eliminarla
    await prisma.trade.delete({
      where: { id: id }
    });
    
    res.json({ message: 'Operación eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar operación:', error);
    res.status(500).json({ error: 'Error al eliminar la operación' });
  }
});

// ============ ELIMINAR MÚLTIPLES GASTOS ============
app.delete('/api/gastos/bulk', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs' });
    }
    
    const idsInt = ids.map(id => parseInt(id));
    
    const result = await prisma.gasto.deleteMany({
      where: {
        id: { in: idsInt }
      }
    });
    
    res.json({ 
      message: `${result.count} gastos eliminados correctamente`,
      count: result.count 
    });
  } catch (error) {
    console.error('Error al eliminar gastos:', error);
    res.status(500).json({ error: 'Error al eliminar los gastos' });
  }
});

// ============ ACTUALIZAR MÚLTIPLES GASTOS ============
app.put('/api/gastos/bulk', async (req, res) => {
  try {
    const { ids, campo, valor, obra_id } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de IDs' });
    }
    
    if (!campo) {
      return res.status(400).json({ error: 'Se requiere el campo a actualizar' });
    }
    
    const idsInt = ids.map(id => parseInt(id));
    
    const data = {};
    if (campo === 'proveedor') data.proveedor = valor;
    else if (campo === 'fecha') data.fecha = new Date(valor);
    else if (campo === 'notas') data.notas = valor;
    else {
      return res.status(400).json({ error: 'Campo no válido' });
    }
    
    const result = await prisma.gasto.updateMany({
      where: {
        id: { in: idsInt },
        obra_id: parseInt(obra_id)
      },
      data
    });
    
    res.json({ 
      message: `${result.count} gastos actualizados correctamente`,
      count: result.count 
    });
  } catch (error) {
    console.error('Error al actualizar gastos:', error);
    res.status(500).json({ error: 'Error al actualizar los gastos' });
  }
});

// ============ CATEGORÍAS ============
app.get('/api/categorias', async (req, res) => {
  try {
    const { obra_id } = req.query;
    
    const where = {};
    if (obra_id) where.obra_id = parseInt(obra_id);
    
    const categorias = await prisma.categoria.findMany({
      where,
      orderBy: { nombre: 'asc' }
    });
    
    res.json(categorias);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al obtener las categorías' });
  }
});

app.post('/api/categorias', async (req, res) => {
  try {
    const { nombre, color, obra_id } = req.body;
    
    const categoria = await prisma.categoria.create({
      data: {
        nombre,
        color,
        obra_id: parseInt(obra_id)
      }
    });
    
    res.status(201).json(categoria);
  } catch (error) {
    console.error('Error al crear categoría:', error);
    res.status(500).json({ error: 'Error al crear la categoría' });
  }
});

// ===================================================
// 💸 ENDPOINTS PARA FLUJO DE CAJA (DEPOSITOS Y RETIROS)
// ===================================================

// 1. Obtener todos los movimientos (Depósitos y Retiros)
app.get('/api/cashflow', async (req, res) => {
  try {
    // 🟢 CAMBIADO A: cashFlow
    const movements = await prisma.cashFlow.findMany({
      orderBy: { date: 'desc' }
    });
    res.json(movements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los movimientos de caja' });
  }
});

// 2. Registrar un nuevo movimiento
app.post('/api/cashflow', async (req, res) => {
  try {
    // 🟢 Agregamos "ticker" a la desestructuración
    const { type, amountValue, date, method, ticker } = req.body;
    
    // 🟢 Incluimos 'DIVIDENDO' en la validación para que deje de tirar error 400
    if (type !== 'DEPOSITO' && type !== 'RETIRO' && type !== 'DIVIDENDO') {
      return res.status(400).json({ error: 'Tipo de movimiento inválido' });
    }

    const newMovement = await prisma.cashFlow.create({
      data: {
        type,
        amountValue: parseFloat(amountValue),
        date: new Date(date),
        method: method || 'Transferencia',
        // 🟢 Si viene un ticker lo guarda en mayúsculas; si no, guarda null (gracias al '?' de Prisma)
        ticker: ticker ? ticker.toUpperCase() : null 
      }
    });
    res.json(newMovement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al registrar el movimiento' });
  }
});

// 3. Editar un movimiento existente
app.put('/api/cashflow/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // 🟢 Agregamos "ticker" también aquí por si editan un dividendo viejo y le asignan acción
    const { type, amountValue, date, method, ticker } = req.body;

    const updatedMovement = await prisma.cashFlow.update({
      where: { id: id },
      data: {
        type,
        amountValue: parseFloat(amountValue),
        date: new Date(date),
        method,
        // 🟢 Permite actualizar o limpiar el ticker al editar
        ticker: ticker ? ticker.toUpperCase() : null 
      }
    });
    res.json(updatedMovement);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el movimiento' });
  }
});

// 4. Eliminar un movimiento
app.delete('/api/cashflow/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 🟢 CAMBIADO A: cashFlow
    await prisma.cashFlow.delete({
      where: { id: id }
    });
    res.json({ message: 'Movimiento eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar el movimiento' });
  }
});

// ============ PUERTO ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});