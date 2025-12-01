// Importaciones de librerías
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt'); // Librería para cifrar y verificar contraseñas
require('dotenv').config();

// Configuración de Express
const app = express();
const port = process.env.PORT || 3000;

// Configuración de CORS
// Permite solicitudes desde cualquier origen (necesario para Flutter)
app.use(cors()); 

// Middleware para parsear JSON
app.use(express.json());

// === 1. CONFIGURACIÓN DE LA CONEXIÓN A POSTGRESQL (AIVEN) ===
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  // 🚨 Habilitar SSL para Aiven
  ssl: {
    rejectUnauthorized: false,
  },
});

// Mensaje para verificar la conexión inicial
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.stack);
  } else {
    console.log('Conexión a PostgreSQL establecida correctamente en:', res.rows[0].now);
  }
});

// Endpoint raíz para verificar que el servidor está funcionando
app.get('/', (req, res) => {
  res.status(200).send('API de Likering está funcionando. Usa /api/usuarios para ver la lista.');
});

// =================================================================
// 🚨 ENDPOINT 1: LISTAR TODOS LOS USUARIOS (GET)
// =================================================================
app.get('/api/usuarios', async (req, res) => {
  try {
    // Se incluye imagen_url en la consulta SELECT
    const queryText = 'SELECT id, nombre, username, descripcion, tipo, seguidores, likes_recibidos, correo, imagen_url FROM usuarios ORDER BY id DESC';
    const result = await pool.query(queryText);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error interno del servidor al obtener la lista de usuarios.' });
  }
});

// =================================================================
// 🚨 ENDPOINT 2: CREAR NUEVO USUARIO (POST - Función de Registro)
// =================================================================
app.post('/api/usuarios', async (req, res) => {
  const { correo, username, contrasena, nombre, descripcion, tipo, imagen_url } = req.body;

  if (!correo || !username || !contrasena || !nombre) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para el registro.' });
  }

  try {
    // Cifrar la contraseña antes de guardarla en la base de datos (seguridad)
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    const queryText = `
      INSERT INTO usuarios (correo, username, contrasena_hash, nombre, descripcion, tipo, imagen_url, seguidores, likes_recibidos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0)
      RETURNING id, nombre, username, correo, imagen_url, tipo`;
      
    const values = [correo, username, hashedPassword, nombre, descripcion || '', tipo || 'personal', imagen_url || null];
    
    const result = await pool.query(queryText, values);
    
    // Devolver el usuario creado (sin la contraseña hasheada)
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear usuario:', err);
    if (err.code === '23505') { // Código de error para violación de unicidad (ej. correo o username ya existe)
        return res.status(409).json({ error: 'El correo electrónico o nombre de usuario ya está registrado.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al registrar el usuario.' });
  }
});

// =================================================================
// 🚨 ENDPOINT 3: BÚSQUEDA DE PERFIL (GET - Lógica del Paso 1 del Login)
// =================================================================
app.get('/api/usuarios/buscar', async (req, res) => {
    const { query } = req.query; // Captura el parámetro 'query'
    
    if (!query) {
        return res.status(400).json({ error: 'Se requiere un parámetro de búsqueda (query).' });
    }

    try {
        const searchQuery = `
            SELECT id, nombre, username, correo, imagen_url
            FROM usuarios
            WHERE username = $1 OR correo = $1`;
            
        // Usamos el mismo valor para buscar en username O correo
        const result = await pool.query(searchQuery, [query]);

        if (result.rows.length === 0) {
            // Usuario no encontrado (404 Not Found)
            return res.status(404).json({ error: 'Usuario o correo no encontrado.' });
        }

        // Devolvemos el perfil encontrado (sin contraseña)
        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error('Error en la búsqueda de perfil:', err);
        res.status(500).json({ error: 'Error interno del servidor al buscar el perfil.' });
    }
});


// =================================================================
// 🚨 ENDPOINT 4: INICIO DE SESIÓN (POST - Lógica del Paso 2 del Login)
// =================================================================
app.post('/api/usuarios/login', async (req, res) => {
    const { query, password } = req.body;
    
    if (!query || !password) {
        return res.status(400).json({ error: 'Faltan credenciales (usuario/correo y contraseña).' });
    }

    try {
        const loginQuery = `
            SELECT id, nombre, username, correo, imagen_url, contrasena_hash
            FROM usuarios
            WHERE username = $1 OR correo = $1`;
            
        const result = await pool.query(loginQuery, [query]);

        if (result.rows.length === 0) {
            // Usuario no existe
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const user = result.rows[0];
        
        // 1. Comparar la contraseña ingresada con el hash almacenado
        const isMatch = await bcrypt.compare(password, user.contrasena_hash);

        if (!isMatch) {
            // Contraseña incorrecta
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        // 2. Autenticación exitosa - Devolvemos el usuario (sin el hash)
        const { contrasena_hash, ...userData } = user;
        res.status(200).json(userData);

    } catch (err) {
        console.error('Error en el inicio de sesión:', err);
        res.status(500).json({ error: 'Error interno del servidor durante el inicio de sesión.' });
    }
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor Express escuchando en el puerto ${port}`);
});