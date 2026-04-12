const express = require('express');
const app = express();
app.use(express.json());

let alumnos = [];
let profesores = [];

const validarAlumno = (data) => {
    if (!data.nombres || typeof data.nombres !== 'string' || data.nombres.trim() === "") return false;
    if (!data.apellidos || typeof data.apellidos !== 'string' || data.apellidos.trim() === "") return false;
    
    if (data.matricula === undefined || data.matricula === null || String(data.matricula).trim() === "") return false;
    
    if (data.promedio === undefined || typeof data.promedio !== 'number') return false;
    return true;
};

const validarProfesor = (data) => {
    if (data.numeroEmpleado === undefined || data.numeroEmpleado === null || String(data.numeroEmpleado).trim() === "") return false;
    
    if (!data.nombres || typeof data.nombres !== 'string' || data.nombres.trim() === "") return false;
    if (!data.apellidos || typeof data.apellidos !== 'string' || data.apellidos.trim() === "") return false;
    if (data.horasClase === undefined || typeof data.horasClase !== 'number') return false;
    return true;
};


app.get('/alumnos', (req, res) => {
    res.status(200).json(alumnos);
});

app.get('/alumnos/:id', (req, res) => {
    const alumno = alumnos.find(a => a.id === parseInt(req.params.id));
    if (!alumno) return res.status(404).json({ error: "Alumno no encontrado" });
    res.status(200).json(alumno);
});

app.post('/alumnos', (req, res) => {
    try {
        if (!validarAlumno(req.body)) return res.status(400).json({ error: "Datos incorrectos o incompletos" });
        
        const newId = alumnos.length > 0 ? Math.max(...alumnos.map(a => a.id)) + 1 : 1;
        const nuevoAlumno = { id: newId, ...req.body };
        alumnos.push(nuevoAlumno);
        
        res.status(201).json(nuevoAlumno);
    } catch (error) {
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.put('/alumnos/:id', (req, res) => {
    try {
        const index = alumnos.findIndex(a => a.id === parseInt(req.params.id));
        if (index === -1) return res.status(404).json({ error: "Alumno no encontrado" });
        if (!validarAlumno(req.body)) return res.status(400).json({ error: "Validación fallida" });

        alumnos[index] = { id: parseInt(req.params.id), ...req.body };
        res.status(200).json(alumnos[index]);
    } catch (error) {
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

app.delete('/alumnos/:id', (req, res) => {
    const index = alumnos.findIndex(a => a.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: "Alumno no encontrado" });
    
    alumnos.splice(index, 1);
    res.status(200).json({ mensaje: "Alumno eliminado correctamente" });
});


app.get('/profesores', (req, res) => {
    res.status(200).json(profesores);
});

app.get('/profesores/:id', (req, res) => {
    const profesor = profesores.find(p => p.id === parseInt(req.params.id));
    if (!profesor) return res.status(404).json({ error: "Profesor no encontrado" });
    res.status(200).json(profesor);
});

app.post('/profesores', (req, res) => {
    try {
        if (!validarProfesor(req.body)) return res.status(400).json({ error: "Validación fallida" });
        
        const newId = profesores.length > 0 ? Math.max(...profesores.map(p => p.id)) + 1 : 1;
        const nuevoProfesor = { id: newId, ...req.body };
        profesores.push(nuevoProfesor);
        
        res.status(201).json(nuevoProfesor);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

app.put('/profesores/:id', (req, res) => {
    try {
        const index = profesores.findIndex(p => p.id === parseInt(req.params.id));
        if (index === -1) return res.status(404).json({ error: "Profesor no encontrado" });
        if (!validarProfesor(req.body)) return res.status(400).json({ error: "Validación fallida" });

        profesores[index] = { id: parseInt(req.params.id), ...req.body };
        res.status(200).json(profesores[index]);
    } catch (error) {
        res.status(500).json({ error: "Error interno" });
    }
});

app.delete('/profesores/:id', (req, res) => {
    const index = profesores.findIndex(p => p.id === parseInt(req.params.id));
    if (index === -1) return res.status(404).json({ error: "Profesor no encontrado" });
    
    profesores.splice(index, 1);
    res.status(200).json({ mensaje: "Profesor eliminado" });
});

app.delete('/alumnos', (req, res) => res.status(405).send());
app.delete('/profesores', (req, res) => res.status(405).send());

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});