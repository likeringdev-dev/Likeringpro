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

// A. Ruta GET: Leer todos los USUARIOS
// URL: /api/usuarios
app.get('/api/usuarios', async (req, res) => {
    console.log('GET /api/usuarios recibido.');
    try {
        // Ejecuta la consulta SQL a la tabla 'usuarios'
       const queryText = 'SELECT id, nombre, username, descripcion, tipo, seguidores, likes_recibidos, imagen_url FROM usuarios ORDER BY id DESC';
        const result = await pool.query(queryText);
        
        // Responde con los resultados
        res.json(result.rows); 
    } catch (err) {
        console.error('Error al obtener usuarios:', err);
        res.status(500).json({ error: 'Fallo interno al obtener datos.' });
    }
});

// B. Ruta POST: Crear un nuevo USUARIO
// URL: /api/usuarios
app.post('/api/usuarios', async (req, res) => {
    // Extrae los campos necesarios para crear un usuario
    const { correo, username, contrasena, nombre, descripcion, tipo } = req.body; 
    
    // Validación de datos esenciales
    if (!correo || !username || !contrasena || !nombre) {
        return res.status(400).json({ error: 'Faltan campos esenciales: correo, username, contrasena, o nombre.' });
    }

    try {
        // ⚠️ Nota: Esta contrasena debe ser hasheada con bcrypt en una aplicación real.
        const queryText = `
            INSERT INTO usuarios (correo, username, contrasena, nombre, descripcion, tipo)
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING id, nombre, username, tipo`;
            
        const result = await pool.query(queryText, [correo, username, contrasena, nombre, descripcion, tipo]);
        
        // Devuelve el objeto creado con el código 201 (Created)
        res.status(201).json(result.rows[0]); 
    } catch (err) {
        console.error('Error al crear usuario:', err);
        // Si hay error por duplicidad (ej. correo o username ya existen)
        if (err.code === '23505') { 
            return res.status(409).json({ error: 'El correo o nombre de usuario ya existe.' });
        }
        res.status(500).json({ error: 'Fallo interno al crear el usuario.' });
    }
});


// 4. Iniciar el Servidor

const port = process.env.API_PORT || 5000; // Usa el puerto de .env o el 5000 por defecto
app.listen(port, () => {
  console.log(`Servidor API escuchando en http://localhost:${port}`);
});