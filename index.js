// index.js

// 1. Dependencias
// Carga las variables del archivo .env al entorno de Node.js
require('dotenv').config(); 
const express = require('express');
const { Pool } = require('pg'); // Cliente de PostgreSQL

const app = express();
// Middleware: Permite a Express leer JSON enviado en el cuerpo de las peticiones HTTP
app.use(express.json()); 

// 2. Configuración de la Conexión a Aiven PostgreSQL
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
  // ESTO ES CRUCIAL para bases de datos en la nube como Aiven (SSL Requerido)
  ssl: {
    rejectUnauthorized: false 
  }
});


// 3. Endpoints (Rutas de la API)

// A. Ruta GET: Leer todos los productos (Para mostrar en Flutter)
// URL: /api/productos
app.get('/api/productos', async (req, res) => {
    console.log('GET /api/productos recibido.');
    try {
        // Ejecuta la consulta SQL
        const result = await pool.query('SELECT id, nombre, precio FROM productos ORDER BY id DESC');
        
        // Responde con los resultados en formato JSON
        res.json(result.rows); 
    } catch (err) {
        console.error('Error al obtener productos:', err);
        res.status(500).json({ error: 'Fallo interno al obtener datos.' });
    }
});

// B. Ruta POST: Crear un nuevo producto (Para enviar datos desde Flutter)
// URL: /api/productos
app.post('/api/productos', async (req, res) => {
    // req.body contiene los datos JSON enviados por Flutter (ej. { "nombre": "Camisa", "precio": 25.99 })
    const { nombre, precio } = req.body; 
    
    // Validación básica de datos
    if (!nombre || precio === undefined) {
        return res.status(400).json({ error: 'Faltan campos (nombre o precio).' });
    }

    try {
        // Ejecuta la consulta SQL con placeholders ($1, $2) para prevenir inyecciones SQL
        const queryText = 'INSERT INTO productos(nombre, precio) VALUES($1, $2) RETURNING id, nombre, precio';
        const result = await pool.query(queryText, [nombre, precio]);
        
        // Devuelve el objeto creado con el código 201 (Created)
        res.status(201).json(result.rows[0]); 
    } catch (err) {
        console.error('Error al crear producto:', err);
        res.status(500).json({ error: 'Fallo interno al crear el producto.' });
    }
});


// 4. Iniciar el Servidor

const port = process.env.API_PORT || 5000; // Usa el puerto de .env o el 5000 por defecto
app.listen(port, () => {
  console.log(`Servidor API escuchando en http://localhost:${port}`);
});