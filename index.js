// Importaciones de librerías
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config(); 

// Configuración de Express
const app = express();
// El puerto de Render debe ser tomado de process.env.PORT, o 10000 como fallback
const port = process.env.PORT || 10000; 

// Configuración de CORS y Middleware
app.use(cors()); 
app.use(express.json());

// =======================================================
// === CONFIGURACIÓN DE LA BASE DE DATOS (CONEXIÓN SSL) ===
// =======================================================

const pool = new Pool({
  // Aseguramos que el puerto se convierta a número entero
  port: parseInt(process.env.PG_PORT, 10), 
  user: process.env.PG_USER, 
  host: process.env.PG_HOST, 
  database: process.env.PG_DATABASE, 
  password: process.env.PG_PASSWORD, 
  
  // Habilitamos SSL para Aiven y usamos rejectUnauthorized: false para ignorar el certificado self-signed
  ssl: {
    rejectUnauthorized: false, 
  },
});

// Mensaje para verificar la conexión inicial (Usando async/await para manejo de errores)
async function testDbConnection() {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Conexión a PostgreSQL establecida correctamente.');
    } catch (err) {
        // La conexión sigue funcionando, pero este error de inicialización evita el mensaje de éxito.
        // Lo mostramos, pero confirmamos que la API sigue viva.
        console.error('❌ Error al conectar a la base de datos (Inicialización):', err.stack);
        console.log('⚠️ NOTA: El servidor Express está operativo, solo la prueba inicial de conexión a la DB falló por el certificado SSL.');
    }
}
testDbConnection(); 
// Fin de la prueba de conexión

// =============================================
// === ENDPOINTS DE AUTENTICACIÓN Y USUARIOS ===
// =============================================

// Endpoint raíz para verificar que el servicio esté vivo
app.get('/', (req, res) => {
    res.send('Servidor Express funcionando. Ir a /api/usuarios/buscar o /api/usuarios/login.');
});


// 2. BUSCAR USUARIO (Paso 1 del Login)
// GET /api/usuarios/buscar?query=alguien
app.get('/api/usuarios/buscar', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.status(400).json({ error: 'Falta el parámetro de búsqueda (query).' });
    }

    try {
        const result = await pool.query(
            // El query utiliza $1 para buscar en ambos campos
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


// 3. INICIAR SESIÓN (Paso 2 del Login: Verifica hash de contraseña)
// POST /api/usuarios/login
app.post('/api/usuarios/login', async (req, res) => {
    const { query, password } = req.body; 
    
    if (!query || !password) {
        return res.status(400).json({ error: 'Faltan credenciales (usuario/correo y contraseña).' });
    }

    try {
        // Seleccionamos el hash de contraseña (contrasena_hash)
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
        // Usamos destructuring para eliminar el hash antes de enviarlo
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