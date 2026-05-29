const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

const awsConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
    }
};

const s3 = new S3Client(awsConfig);
const sns = new SNSClient(awsConfig);
const dynamo = new DynamoDBClient(awsConfig);

const S3_BUCKET = process.env.S3_BUCKET;               
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;       
const DYNAMO_TABLE = process.env.DYNAMO_TABLE || 'sesiones-alumnos';

const sequelize = new Sequelize(
    process.env.DB_NAME || 'sicei',
    process.env.DB_USER || 'admin',
    process.env.DB_PASSWORD || 'password',
    {
        host: process.env.DB_HOST || 'localhost',
        dialect: 'mysql',         
        port: process.env.DB_PORT || 3306,
        logging: false,
    }
);

const Alumno = sequelize.define('Alumno', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombres: { type: DataTypes.STRING, allowNull: false },
    apellidos: { type: DataTypes.STRING, allowNull: false },
    matricula: { type: DataTypes.STRING, allowNull: false },
    promedio: { type: DataTypes.FLOAT, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: true },
    fotoPerfilUrl: { type: DataTypes.STRING, allowNull: true },
}, { tableName: 'alumnos', timestamps: false });

const Profesor = sequelize.define('Profesor', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    numeroEmpleado: { type: DataTypes.STRING, allowNull: false },
    nombres: { type: DataTypes.STRING, allowNull: false },
    apellidos: { type: DataTypes.STRING, allowNull: false },
    horasClase: { type: DataTypes.FLOAT, allowNull: false },
}, { tableName: 'profesores', timestamps: false });

const validarAlumno = (data) => {
    if (!data.nombres || typeof data.nombres !== 'string' || data.nombres.trim() === '') return false;
    if (!data.apellidos || typeof data.apellidos !== 'string' || data.apellidos.trim() === '') return false;
    if (data.matricula === undefined || data.matricula === null || String(data.matricula).trim() === '') return false;
    if (data.promedio === undefined || typeof data.promedio !== 'number') return false;
    return true;
};

const validarProfesor = (data) => {
    if (data.numeroEmpleado === undefined || data.numeroEmpleado === null || String(data.numeroEmpleado).trim() === '') return false;
    if (!data.nombres || typeof data.nombres !== 'string' || data.nombres.trim() === '') return false;
    if (!data.apellidos || typeof data.apellidos !== 'string' || data.apellidos.trim() === '') return false;
    if (data.horasClase === undefined || typeof data.horasClase !== 'number') return false;
    return true;
};

const upload = multer({ storage: multer.memoryStorage() });


app.get('/alumnos', async (req, res) => {
    try {
        const alumnos = await Alumno.findAll();
        res.status(200).json(alumnos);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/alumnos/:id', async (req, res) => {
    try {
        const alumno = await Alumno.findByPk(parseInt(req.params.id));
        if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
        res.status(200).json(alumno);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/alumnos', async (req, res) => {
    try {
        if (!validarAlumno(req.body)) return res.status(400).json({ error: 'Datos incorrectos o incompletos' });
        const nuevoAlumno = await Alumno.create(req.body);
        res.status(201).json(nuevoAlumno);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.put('/alumnos/:id', async (req, res) => {
    try {
        const alumno = await Alumno.findByPk(parseInt(req.params.id));
        if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
        if (!validarAlumno(req.body)) return res.status(400).json({ error: 'Validación fallida' });
        await alumno.update(req.body);
        res.status(200).json(alumno);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.delete('/alumnos/:id', async (req, res) => {
    try {
        const alumno = await Alumno.findByPk(parseInt(req.params.id));
        if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
        await alumno.destroy();
        res.status(200).json({ mensaje: 'Alumno eliminado correctamente' });
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/alumnos/:id/fotoPerfil', upload.single('foto'), async (req, res) => {
    try {
        const alumno = await Alumno.findByPk(parseInt(req.params.id));
        if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
        if (!req.file) return res.status(400).json({ error: 'No se proporcionó imagen' });

        const ext = path.extname(req.file.originalname) || '.jpg';
        const key = `fotos/${req.params.id}_${Date.now()}${ext}`;

        const command = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read',
        });

        await s3.send(command);

        const url = `https://${S3_BUCKET}.s3.amazonaws.com/${key}`;
        await alumno.update({ fotoPerfilUrl: url });

        res.status(200).json({ fotoPerfilUrl: url });
    } catch (err) {
        console.error('Error subiendo foto:', err);
        res.status(500).json({ error: 'Error al subir la foto' });
    }
});

app.post('/alumnos/:id/email', async (req, res) => {
    try {
        const alumno = await Alumno.findByPk(parseInt(req.params.id));
        if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

        const mensaje = `
            Información del Alumno:
            Nombre: ${alumno.nombres} ${alumno.apellidos}
            Matrícula: ${alumno.matricula}
            Promedio: ${alumno.promedio}
        `.trim();

        const command = new PublishCommand({
            TopicArn: SNS_TOPIC_ARN,
            Message: mensaje,
            Subject: `Calificaciones de ${alumno.nombres} ${alumno.apellidos}`,
        });

        await sns.send(command);
        res.status(200).json({ mensaje: 'Correo enviado correctamente' });
    } catch (err) {
        console.error('Error enviando SNS:', err);
        res.status(500).json({ error: 'Error al enviar el correo' });
    }
});

app.post('/alumnos/:id/session/login', async (req, res) => {
    try {
        const alumno = await Alumno.findByPk(parseInt(req.params.id));
        if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

        const { password } = req.body;
        if (!password || password !== alumno.password) {
            return res.status(400).json({ error: 'Contraseña incorrecta' });
        }

        const sessionId = crypto.randomUUID();
        const sessionString = crypto.randomBytes(64).toString('hex');
        const fecha = Math.floor(Date.now() / 1000);

        await dynamo.send(new PutItemCommand({
            TableName: DYNAMO_TABLE,
            Item: {
                id: { S: sessionId },
                fecha: { N: String(fecha) },
                alumnoId: { N: String(alumno.id) },
                active: { BOOL: true },
                sessionString: { S: sessionString },
            }
        }));

        res.status(200).json({ sessionString });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/alumnos/:id/session/verify', async (req, res) => {
    try {
        const { sessionString } = req.body;
        if (!sessionString) return res.status(400).json({ error: 'sessionString requerido' });

        const { ScanCommand } = require('@aws-sdk/client-dynamodb');
        const result = await dynamo.send(new ScanCommand({
            TableName: DYNAMO_TABLE,
            FilterExpression: 'sessionString = :ss AND alumnoId = :aid',
            ExpressionAttributeValues: {
                ':ss': { S: sessionString },
                ':aid': { N: String(req.params.id) },
            }
        }));

        if (!result.Items || result.Items.length === 0) {
            return res.status(400).json({ error: 'Sesión no encontrada' });
        }

        const sesion = result.Items[0];
        if (!sesion.active.BOOL) {
            return res.status(400).json({ error: 'Sesión inactiva' });
        }

        res.status(200).json({ mensaje: 'Sesión válida' });
    } catch (err) {
        console.error('Error en verify:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/alumnos/:id/session/logout', async (req, res) => {
    try {
        const { sessionString } = req.body;
        if (!sessionString) return res.status(400).json({ error: 'sessionString requerido' });

        const { ScanCommand } = require('@aws-sdk/client-dynamodb');
        const result = await dynamo.send(new ScanCommand({
            TableName: DYNAMO_TABLE,
            FilterExpression: 'sessionString = :ss AND alumnoId = :aid',
            ExpressionAttributeValues: {
                ':ss': { S: sessionString },
                ':aid': { N: String(req.params.id) },
            }
        }));

        if (!result.Items || result.Items.length === 0) {
            return res.status(400).json({ error: 'Sesión no encontrada' });
        }

        const sesionId = result.Items[0].id.S;

        await dynamo.send(new UpdateItemCommand({
            TableName: DYNAMO_TABLE,
            Key: { id: { S: sesionId } },
            UpdateExpression: 'SET active = :false',
            ExpressionAttributeValues: { ':false': { BOOL: false } },
        }));

        res.status(200).json({ mensaje: 'Sesión cerrada correctamente' });
    } catch (err) {
        console.error('Error en logout:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/profesores', async (req, res) => {
    try {
        const profesores = await Profesor.findAll();
        res.status(200).json(profesores);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/profesores/:id', async (req, res) => {
    try {
        const profesor = await Profesor.findByPk(parseInt(req.params.id));
        if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
        res.status(200).json(profesor);
    } catch (err) {
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/profesores', async (req, res) => {
    try {
        if (!validarProfesor(req.body)) return res.status(400).json({ error: 'Validación fallida' });
        const nuevoProfesor = await Profesor.create(req.body);
        res.status(201).json(nuevoProfesor);
    } catch (err) {
        res.status(500).json({ error: 'Error interno' });
    }
});

app.put('/profesores/:id', async (req, res) => {
    try {
        const profesor = await Profesor.findByPk(parseInt(req.params.id));
        if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
        if (!validarProfesor(req.body)) return res.status(400).json({ error: 'Validación fallida' });
        await profesor.update(req.body);
        res.status(200).json(profesor);
    } catch (err) {
        res.status(500).json({ error: 'Error interno' });
    }
});

app.delete('/profesores/:id', async (req, res) => {
    try {
        const profesor = await Profesor.findByPk(parseInt(req.params.id));
        if (!profesor) return res.status(404).json({ error: 'Profesor no encontrado' });
        await profesor.destroy();
        res.status(200).json({ mensaje: 'Profesor eliminado' });
    } catch (err) {
        res.status(500).json({ error: 'Error interno' });
    }
});

app.delete('/alumnos', (req, res) => res.status(405).send());
app.delete('/profesores', (req, res) => res.status(405).send());

const PORT = process.env.PORT || 8080;

sequelize.sync({ alter: true })
    .then(() => {
        console.log('Base de datos sincronizada');
        app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
    })
    .catch(err => {
        console.error('Error conectando a la base de datos:', err);
        process.exit(1);
    });