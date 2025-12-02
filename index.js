// Importaciones de librerías
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// =========================================
// === CONFIGURACIÓN DE CLOUDINARY ===
// =========================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de Express
const app = express();
const port = process.env.API_PORT || 10000; // Usamos API_PORT del .env

// Configuración de CORS y Middleware
app.use(cors());

// Aumentamos el límite de tamaño del cuerpo para manejar imágenes Base64 grandes (50MB es un buen límite)
app.use(express.json({ limit: '50mb' }));

// =======================================================
// === CONFIGURACIÓN DE LA BASE DE DATOS (CONEXIÓN SSL) ===
// =======================================================
const pool = new Pool({
  // Usamos la cadena de conexión completa que incluye todos los parámetros
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Necesario para bases de datos Aiven o Cloud que usan SSL autofirmado
  },
});

// Mensaje para verificar la conexión inicial
async function testDbConnection() {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Conexión a PostgreSQL establecida correctamente.');
    } catch (err) {
        console.error('❌ Error al conectar con PostgreSQL:', err.message);
    }
}

testDbConnection();


// =========================================
// === RUTA DE REGISTRO DE USUARIO ===
// =========================================

app.post('/api/usuarios/registro', async (req, res) => {
    try {
        // Extraemos todos los datos, incluyendo la imagen Base64 (opcional)
        const { nombre, correo, username, contrasena, imagenBase64 } = req.body;

        // 1. Validaciones básicas de campos obligatorios
        if (!nombre || !correo || !username || !contrasena) {
            return res.status(400).json({ error: 'Faltan campos obligatorios (nombre, correo, username, contrasena).' });
        }

        // 2. Revisar si el usuario o correo ya existen
        const existingUser = await pool.query(
            'SELECT id FROM usuarios WHERE username = $1 OR correo = $2',
            [username, correo]
        );
        
        if (existingUser.rows.length > 0) {
            // Error 409: Conflicto (Recurso ya existente)
            return res.status(409).json({ error: 'El nombre de usuario o correo ya está registrado.' });
        }

        // 3. Subir imagen a Cloudinary (si se proporcionó)
        let imageUrl = null;
        if (imagenBase64) {
            // Cloudinary maneja el string Base64 (con o sin prefijo Data URL) de forma nativa, 
            // evitando el error ENAMETOOLONG al no tocar el disco local.
            console.log('Iniciando subida de imagen a Cloudinary...');
            const uploadResult = await cloudinary.uploader.upload(imagenBase64, {
                folder: "likering_avatars", // Carpeta en Cloudinary
                resource_type: "image", // Forzamos el tipo
            });
            imageUrl = uploadResult.secure_url; // URL pública para guardar en DB
            console.log(`✅ Imagen subida a Cloudinary: ${imageUrl}`);
        } else {
             console.log('No se proporcionó imagen Base64. Usando valor nulo para imagen_url.');
        }


        // 4. Hashear la contraseña
        const saltRounds = 10;
        const contrasenaHash = await bcrypt.hash(contrasena, saltRounds);
        console.log('Contraseña hasheada correctamente.');


        // 5. Insertar el nuevo usuario en PostgreSQL
        // Asegúrate de que tu tabla `usuarios` tenga las columnas: 
        // id, nombre, username, correo, contrasena_hash, imagen_url, tipo, seguidores
        const insertQuery = `
            INSERT INTO usuarios (nombre, username, correo, contrasena_hash, imagen_url, tipo, seguidores)
            VALUES ($1, $2, $3, $4, $5, 'general', 0)
            RETURNING id, nombre, username, correo, imagen_url, tipo, seguidores`;

        const newUserResult = await pool.query(insertQuery, [
            nombre,
            username,
            correo,
            contrasenaHash,
            imageUrl
        ]);

        const newUser = newUserResult.rows[0];
        console.log(`✅ Nuevo usuario registrado con ID: ${newUser.id}`);
        
        // 6. Registro exitoso (Código 201 Created)
        res.status(201).json(newUser);

    } catch (err) {
        console.error('❌ Error fatal al registrar usuario:', err.message); 
        // Para errores internos de DB o Cloudinary, devolvemos un 500
        res.status(500).json({ error: 'Error interno del servidor durante el registro.' });
    }
});


// =========================================
// === RUTA DE INICIO DE SESIÓN (LOGIN) ===
// =========================================

app.post('/api/usuarios/login', async (req, res) => {
    const { query, password } = req.body; // 'query' puede ser username o correo

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
        console.log(`✅ Inicio de sesión exitoso para usuario: ${userData.username}`);
        res.status(200).json(userData);

    } catch (err) {
        console.error('❌ Error en el inicio de sesión:', err.message);
        res.status(500).json({ error: 'Error interno del servidor durante el inicio de sesión.' });
    }
});


// =========================================
// === INICIO DEL SERVIDOR ===
// =========================================

app.listen(port, () => {
    console.log(`Servidor Express escuchando en el puerto ${port}`);
});