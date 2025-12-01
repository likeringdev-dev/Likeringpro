const bcrypt = require('bcrypt');

const password = 'pass123';
const saltRounds = 10; // Nivel de seguridad del hash

console.log(`Generando hash para la contraseña: ${password}\n`);

// Genera el hash de forma asíncrona
bcrypt.hash(password, saltRounds, function(err, hash) {
    if (err) {
        console.error("Error al generar el hash:", err);
        return;
    }
    
    console.log("-----------------------------------------------------------------");
    console.log("COPIA ESTE HASH (incluyendo $2b$):");
    console.log(hash);
    console.log("-----------------------------------------------------------------\n");
    console.log("Guarda este script después de ejecutarlo o genera más hashes si es necesario.");
});