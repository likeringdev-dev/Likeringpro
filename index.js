// Importaciones de librerías
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2; // Importamos Cloudinary
require('dotenv').config();

// =========================================
// === CONFIGURACIÓN DE CLOUDINARY ===
// =========================================
// Nota: Estas variables deben estar configuradas en el panel de Render, no solo en .env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de Express
const app = express();
// El puerto de Render debe ser tomado de process.env.PORT, o 10000 como fallback
const port = process.env.PORT || 10000;

// Configuración de CORS y Middleware
app.use(cors());

// 💡 CORRECCIÓN: Aumentamos el límite de tamaño del cuerpo para manejar imágenes Base64 grandes
app.use(express.json({ limit: '50mb' }));

// =======================================================
// === CONFIGURACIÓN DE LA BASE DE DATOS (CONEXIÓN SSL) ===
// =======================================================

const pool = new Pool({
  // 💡 AJUSTE: Usamos la cadena de conexión completa de Render (DATABASE_URL)
  connectionString: process.env.DATABASE_URL,
  
  // Mantenemos esta configuración para ignorar el certificado self-signed de Aiven.
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
        console.error('❌ Error al conectar con PostgreSQL:', err);
        // Si sigue fallando aquí, el problema es de red/firewall/credenciales.
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
            return res.status(400).json({ error: 'Faltan campos obligatorios.' });
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
            // Cloudinary acepta el string Base64 directamente
            const uploadResult = await cloudinary.uploader.upload(imagenBase64, {
                folder: "likering_avatars", // Carpeta donde se guardará en Cloudinary
                resource_type: "image",
            });
            imageUrl = uploadResult.secure_url; // Obtenemos la URL pública
            console.log('Imagen subida a Cloudinary:', imageUrl);
        }

        // 4. Hashear la contraseña
        const saltRounds = 10;
        const contrasenaHash = await bcrypt.hash(contrasena, saltRounds);

        // 5. Insertar el nuevo usuario en PostgreSQL
        const insertQuery = `
            INSERT INTO usuarios (nombre, username, correo, contrasena_hash, imagen_url, tipo, seguidores)
            VALUES ($1, $2, $3, $4, $5, 'general', 0)
            RETURNING id, nombre, username, correo, imagen_url, tipo, seguidores`;

        const newUserResult = await pool.query(insertQuery, [
            nombre,
            username,
            correo,
            contrasenaHash,
            imageUrl // Será NULL si la imagen no se proporcionó
        ]);

        const newUser = newUserResult.rows[0];
        
        // 6. Registro exitoso (Código 201 Created)
        res.status(201).json(newUser);

    } catch (err) {
        // 💡 Importante: Imprime el error real en los logs de Render para depurar.
        console.error('Error al registrar usuario:', err); 
        res.status(500).json({ error: 'Error interno del servidor durante el registro' });
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