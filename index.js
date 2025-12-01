// Importaciones de librerías
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt'); // Librería para cifrar y verificar contraseñas
require('dotenv').config(); // Cargar variables de entorno desde .env (Solo para desarrollo local)

// Configuración de Express
const app = express();
// El puerto de Render debe ser tomado de process.env.PORT, o 3000/10000 como fallback
const port = process.env.PORT || 3000; 

// Configuración de CORS
// Permite solicitudes desde cualquier origen (necesario para Flutter)
app.use(cors()); 

// Middleware para parsear JSON
app.use(express.json());

// === 1. CONFIGURACIÓN DE LA CONEXIÓN A POSTGRESQL (AIVEN) ===
const pool = new Pool({
  // Utiliza variables de entorno individuales que tienes configuradas
  user: process.env.PG_USER, //
  host: process.env.PG_HOST, //
  database: process.env.PG_DATABASE, //
  password: process.env.PG_PASSWORD, //
  port: process.env.PG_PORT, //
  
  // 🚨 Habilitar SSL para Aiven y evitar el error SELF_SIGNED_CERT_IN_CHAIN
  ssl: {
    rejectUnauthorized: false, // Permite la conexión sin un certificado CA específico
  },
});

// Mensaje para verificar la conexión inicial
pool.query('SELECT NOW()')
  .then(res => {
    console.log('✅ Conexión a PostgreSQL establecida correctamente en:', res.rows[0].now);
  })
  .catch(err => {
    // Si la conexión falla, el servidor Express se mantiene activo.
    console.error('❌ Error al conectar a la base de datos:', err.stack);
  });

// =============================================
// === ENDPOINTS DE AUTENTICACIÓN Y USUARIOS ===
// =============================================

// Endpoint raíz para verificar que el servicio esté vivo
app.get('/', (req, res) => {
    res.send('Servidor Express funcionando. Ir a /api/usuarios para ver datos.');
});


// 2. BUSCAR USUARIO (Paso 1 del Login en Flutter: Busca por username o correo)
// GET /api/usuarios/buscar?query=alguien
app.get('/api/usuarios/buscar', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Falta el parámetro de búsqueda (query).' });
    }

    try {
        const result = await pool.query(
            'SELECT id, nombre, username, correo, imagen_url FROM usuarios WHERE username = $1 OR correo = $1', 
            [query]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        const user = result.rows[0];
        res.json(user);

    } catch (err) {
        console.error('Error al buscar usuario:', err);
        res.status(500).json({ error: 'Error interno al buscar usuario.' });
    }
});


// 3. INICIAR SESIÓN (Paso 2 del Login en Flutter: Verifica hash de contraseña con bcrypt)
// POST /api/usuarios/login
app.post('/api/usuarios/login', async (req, res) => {
    const { query, password } = req.body; // 'query' es username o email
    
    if (!query || !password) {
        return res.status(400).json({ error: 'Faltan credenciales (usuario/correo y contraseña).' });
    }

    try {
        // Seleccionamos el hash de contraseña (contrasena_hash) para la verificación
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
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        // 2. Autenticación exitosa - Devolvemos el usuario (sin el hash)
        const { contrasena_hash, ...userData } = user;
        res.status(200).json(userData);

    } catch (err) {
        console.error('Error en el inicio de sesión:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


// =========================================
// === INICIO DEL SERVIDOR ===
// =========================================

app.listen(port, () => {
    console.log(`Servidor Express escuchando en el puerto ${port}`);
});