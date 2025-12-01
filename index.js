const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const cors = require('cors');

// Cargar variables de entorno desde .env (Solo para desarrollo local)
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// =======================================================
// === CONFIGURACIÓN DE LA BASE DE DATOS (CONEXIÓN SSL) ===
// =======================================================

// 🚨 Utilizamos DATABASE_URL para la conexión. 
// Render establece process.env.DATABASE_URL por defecto si usas un Internal Database, 
// o la debes configurar tú si usas una externa (como Aiven).
const pool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    // Para entornos como Aiven/Render, configuramos SSL
    ssl: {
        rejectUnauthorized: false, // Permite la conexión sin un certificado CA específico
    }
});

// Prueba de conexión
pool.connect()
  .then(() => {
    console.log('✅ Conexión a PostgreSQL establecida correctamente.');
  })
  .catch((err) => {
    console.error('❌ Error al conectar a la base de datos:', err);
    // Si la conexión falla, el servidor Express se mantiene activo para que puedas ver el error en los logs de Render.
  });

// =========================================
// === ENDPOINTS DE USUARIOS (API REST) ===
// =========================================

// Endpoint de prueba
app.get('/', (req, res) => {
    res.send('Servidor Express funcionando. Ir a /api/usuarios para ver datos.');
});

// 1. Obtener todos los usuarios
app.get('/api/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM usuarios');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// 2. BUSCAR USUARIO (Paso 1 del Login en Flutter: Busca por username o correo)
// GET /api/usuarios/buscar?query=alguien
app.get('/api/usuarios/buscar', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Falta el parámetro de búsqueda (query).' });
    }

    try {
        // Busca si el query coincide con el username O con el correo
        const result = await pool.query(
            'SELECT id, nombre, username, tipo, seguidores, imagen_url, correo, password FROM usuarios WHERE username = $1 OR correo = $1', 
            [query.toLowerCase()] // Usamos toLowerCase para hacer la búsqueda sensible a mayúsculas/minúsculas
        );

        if (result.rows.length === 0) {
            // El usuario no fue encontrado (Retorna 404 como espera el api_service.dart de Flutter)
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        // Retorna el primer usuario encontrado (el paso 1 no necesita la contraseña)
        const user = result.rows[0];
        // Eliminamos la contraseña antes de enviarla
        delete user.password; 

        res.json(user);

    } catch (err) {
        console.error('Error al buscar usuario:', err);
        res.status(500).json({ error: 'Error interno al buscar usuario.' });
    }
});

// 3. INICIAR SESIÓN (Paso 2 del Login en Flutter: Verifica password)
// POST /api/usuarios/login
app.post('/api/usuarios/login', async (req, res) => {
    const { query, password } = req.body; // 'query' es username o email

    if (!query || !password) {
        return res.status(400).json({ error: 'Faltan credenciales (query y/o password).' });
    }

    try {
        // Busca al usuario (incluye la contraseña para verificación)
        const result = await pool.query(
            'SELECT id, nombre, username, tipo, seguidores, imagen_url, correo, password FROM usuarios WHERE username = $1 OR correo = $1', 
            [query.toLowerCase()]
        );

        if (result.rows.length === 0) {
            // No existe el usuario
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const user = result.rows[0];

        // 🚨 NOTA: En un entorno real, usarías una librería de hashing (como bcrypt)
        // para comparar la contraseña ingresada con la contraseña hasheada guardada.
        // Aquí asumiremos un chequeo simple para propósitos de prueba:
        if (user.password !== password) {
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        // Login exitoso: Eliminamos la contraseña antes de devolver el objeto
        delete user.password; 
        res.status(200).json(user);

    } catch (err) {
        console.error('Error durante el login:', err);
        res.status(500).json({ error: 'Error interno del servidor durante el login.' });
    }
});


// =========================================
// === INICIO DEL SERVIDOR ===
// =========================================

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor Express escuchando en el puerto ${PORT}`);
});