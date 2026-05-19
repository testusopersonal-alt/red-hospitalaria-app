// ============================================================
// server.js — Clínicas La Perla
// Refactorizado aplicando los 4 Pilares de POO
// ============================================================

const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
require('dotenv').config();

// ============================================================
// PILAR 1 — ABSTRACCIÓN
// La clase Database oculta toda la complejidad de Oracle.
// El resto del código nunca sabe cómo se conecta; solo pide datos.
// ============================================================
class Database {
    constructor() {
        this.pool = null;
    }

    async connect() {
        this.pool = await oracledb.createPool({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING,
            poolMin: 1,
            poolMax: 10
        });
        console.log('✅ Conectado a Oracle');
    }

    // Método central oculto detrás de una interfaz simple
    async execute(sql, binds = [], autoCommit = false) {
        let conn;
        try {
            conn = await this.pool.getConnection();
            const result = await conn.execute(sql, binds, { autoCommit });
            return result;
        } finally {
            if (conn) await conn.close();
        }
    }

    async getConnection() {
        return await this.pool.getConnection();
    }
}

// Instancia única (patrón Singleton — también abstracción)
const db = new Database();


// ============================================================
// PILAR 2 — ENCAPSULAMIENTO
// Clase base Repository: nadie accede a `db` directamente
// desde los controladores. Todo pasa por métodos controlados.
// ============================================================
class Repository {
    constructor(tabla, secuencia, idColumna) {
        this._tabla     = tabla;       // privado por convención (_)
        this._secuencia = secuencia;
        this._idColumna = idColumna;
    }

    // Métodos protegidos reutilizables
    async _getAll(orderBy = '') {
        const sql = `SELECT * FROM ${this._tabla}${orderBy ? ' ORDER BY ' + orderBy : ''}`;
        const result = await db.execute(sql);
        return result.rows;
    }

    async _deleteById(id) {
        await db.execute(
            `DELETE FROM ${this._tabla} WHERE ${this._idColumna} = :1`,
            [id],
            true
        );
    }

    async _nextId() {
        const result = await db.execute(`SELECT ${this._secuencia}.NEXTVAL FROM DUAL`);
        return result.rows[0][0];
    }
}


// ============================================================
// PILAR 3 — HERENCIA
// Cada repositorio hereda de Repository y solo agrega
// lo que lo hace único (INSERT, UPDATE, búsqueda propia).
// ============================================================

class PacienteRepository extends Repository {
    constructor() {
        super('pacientes', 'seq_pacientes', 'id_paciente');
    }

    async getAll()          { return this._getAll('id_paciente'); }
    async deleteById(id)    { return this._deleteById(id); }

    async search(q) {
        const valor = `%${q}%`;
        const result = await db.execute(
            `SELECT * FROM pacientes
             WHERE UPPER(nombres)   LIKE UPPER(:1)
                OR UPPER(apellidos) LIKE UPPER(:2)
                OR telefono         LIKE :3`,
            [valor, valor, valor]
        );
        return result.rows;
    }

    async create({ nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion, correo }) {
        const id = await this._nextId();
        await db.execute(
            `INSERT INTO pacientes (id_paciente, nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion, correo)
             VALUES (:1, :2, :3, TO_DATE(:4,'YYYY-MM-DD'), :5, :6, :7, :8)`,
            [id, nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion, correo],
            true
        );
        return id;
    }

    async update(id, { nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion, correo }) {
        await db.execute(
            `UPDATE pacientes
             SET nombres=:1, apellidos=:2, fecha_nacimiento=TO_DATE(:3,'YYYY-MM-DD'),
                 sexo=:4, telefono=:5, direccion=:6, correo=:7
             WHERE id_paciente=:8`,
            [nombres, apellidos, fecha_nacimiento, sexo, telefono, direccion, correo, id],
            true
        );
    }
}

class MedicoRepository extends Repository {
    constructor() {
        super('medicos', 'seq_medicos', 'id_medico');
    }

    async deleteById(id) { return this._deleteById(id); }

    async getAll() {
        const result = await db.execute(`
            SELECT m.id_medico, m.nombres, m.apellidos, m.telefono, m.correo,
                   e.nombre AS especialidad, m.id_especialidad
            FROM medicos m
            JOIN especialidades e ON m.id_especialidad = e.id_especialidad
            ORDER BY m.id_medico
        `);
        return result.rows;
    }

    async create({ nombres, apellidos, telefono, correo, id_especialidad }) {
        const id = await this._nextId();
        await db.execute(
            `INSERT INTO medicos (id_medico, nombres, apellidos, telefono, correo, id_especialidad)
             VALUES (:1, :2, :3, :4, :5, :6)`,
            [id, nombres, apellidos, telefono, correo, id_especialidad],
            true
        );
        return id;
    }

    async update(id, { nombres, apellidos, telefono, correo, id_especialidad }) {
        await db.execute(
            `UPDATE medicos SET nombres=:1, apellidos=:2, telefono=:3, correo=:4, id_especialidad=:5
             WHERE id_medico=:6`,
            [nombres, apellidos, telefono, correo, id_especialidad, id],
            true
        );
    }
}

class MedicamentoRepository extends Repository {
    constructor() {
        super('medicamentos', 'seq_medicamentos', 'id_medicamento');
    }

    async getAll()       { return this._getAll('id_medicamento'); }
    async deleteById(id) { return this._deleteById(id); }

    async create({ nombre, descripcion, precio_actual, stock_actual }) {
        const id = await this._nextId();
        await db.execute(
            `INSERT INTO medicamentos (id_medicamento, nombre, descripcion, precio_actual, stock_actual)
             VALUES (:1, :2, :3, :4, :5)`,
            [id, nombre, descripcion, precio_actual, stock_actual],
            true
        );
        return id;
    }

    async update(id, { nombre, descripcion, precio_actual, stock_actual }) {
        await db.execute(
            `UPDATE medicamentos SET nombre=:1, descripcion=:2, precio_actual=:3, stock_actual=:4
             WHERE id_medicamento=:5`,
            [nombre, descripcion, precio_actual, stock_actual, id],
            true
        );
    }
}

class UsuarioRepository extends Repository {
    constructor() {
        super('usuarios', 'seq_usuarios', 'id_usuario');
    }

    async deleteById(id) { return this._deleteById(id); }

    async getAll() {
        const result = await db.execute(`SELECT id_usuario, usuario, rol FROM usuarios`);
        return result.rows;
    }

    async findByCredentials(usuario, clave) {
        const result = await db.execute(
            `SELECT id_usuario, usuario, rol FROM usuarios WHERE usuario=:1 AND clave=:2`,
            [usuario, clave]
        );
        return result.rows[0] || null;
    }

    async create({ usuario, clave, rol }) {
        const id = await this._nextId();
        await db.execute(
            `INSERT INTO usuarios (id_usuario, usuario, clave, rol) VALUES (:1, :2, :3, :4)`,
            [id, usuario, clave, rol],
            true
        );
        return id;
    }

    async update(id, { usuario, clave, rol }) {
        if (clave) {
            // Edición con nueva clave
            await db.execute(
                `UPDATE usuarios SET usuario=:1, clave=:2, rol=:3 WHERE id_usuario=:4`,
                [usuario, clave, rol, id],
                true
            );
        } else {
            // Edición sin tocar la clave (campo vacío en el modal)
            await db.execute(
                `UPDATE usuarios SET usuario=:1, rol=:2 WHERE id_usuario=:3`,
                [usuario, rol, id],
                true
            );
        }
    }
}


// ============================================================
// PILAR 4 — POLIMORFISMO
// RouterFactory crea rutas CRUD de manera uniforme.
// Cada repositorio responde al mismo "mensaje" (getAll,
// create, update, deleteById) pero ejecuta su propia lógica.
// ============================================================
class RouterFactory {
    /**
     * Genera rutas GET / POST / PUT / DELETE estándar
     * para cualquier repositorio que siga la interfaz común.
     */
    static create(repo, { searchEnabled = false, path = '' } = {}) {
        const router = express.Router();

        // GET todos
        router.get('/', async (req, res) => {
            try {
                res.json(await repo.getAll());
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // GET búsqueda (solo si el repo lo soporta)
        if (searchEnabled) {
            router.get('/buscar', async (req, res) => {
                try {
                    res.json(await repo.search(req.query.q || ''));
                } catch (err) {
                    res.status(500).json({ error: err.message });
                }
            });
        }

        // POST crear
        router.post('/', async (req, res) => {
            try {
                const id = await repo.create(req.body);
                res.json({ id, message: 'Creado correctamente' });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PUT actualizar
        router.put('/:id', async (req, res) => {
            try {
                await repo.update(req.params.id, req.body);
                res.json({ message: 'Actualizado correctamente' });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // DELETE eliminar
        router.delete('/:id', async (req, res) => {
            try {
                await repo.deleteById(req.params.id);
                res.json({ message: 'Eliminado correctamente' });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        return router;
    }
}


// ============================================================
// RUTAS ESPECIALES (lógica que no es CRUD estándar)
// ============================================================

// --- CITAS (usa stored procedure) ---
function buildCitasRouter() {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const result = await db.execute(`
                SELECT c.id_cita, c.fecha_hora, c.motivo, c.estado_cita,
                       p.nombres||' '||p.apellidos AS paciente,
                       m.nombres||' '||m.apellidos AS medico,
                       con.nombre AS consultorio
                FROM citas c
                JOIN pacientes p   ON c.id_paciente    = p.id_paciente
                JOIN medicos m     ON c.id_medico       = m.id_medico
                JOIN consultorios con ON c.id_consultorio = con.id_consultorio
                ORDER BY c.fecha_hora DESC
            `);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/agendar', async (req, res) => {
        const { id_paciente, id_medico, fecha_hora, motivo, id_consultorio, id_turno } = req.body;
        let conn;
        try {
            conn = await db.getConnection();
            const result = await conn.execute(
                `BEGIN sp_agendar_cita(:p_id_paciente, :p_id_medico,
                    TO_TIMESTAMP(:p_fecha_hora,'YYYY-MM-DD HH24:MI:SS'),
                    :p_motivo, :p_id_consultorio, :p_id_turno, :p_nuevo_id_cita); END;`,
                {
                    p_id_paciente:    id_paciente,
                    p_id_medico:      id_medico,
                    p_fecha_hora:     fecha_hora,
                    p_motivo:         motivo,
                    p_id_consultorio: id_consultorio,
                    p_id_turno:       id_turno,
                    p_nuevo_id_cita:  { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
                }
            );
            await conn.commit();
            res.json({ id_cita: result.outBinds.p_nuevo_id_cita, mensaje: 'Cita agendada' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally {
            if (conn) await conn.close();
        }
    });

    router.put('/:id/estado', async (req, res) => {
        try {
            await db.execute(
                `UPDATE citas SET estado_cita=:1 WHERE id_cita=:2`,
                [req.body.estado_cita, req.params.id],
                true
            );
            res.json({ message: 'Estado actualizado' });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}

// --- FACTURACIÓN (transacción multi-tabla) ---
function buildFacturasRouter() {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const result = await db.execute(`
                SELECT f.id_factura, f.fecha_factura, f.total,
                       p.nombres||' '||p.apellidos AS paciente
                FROM facturas f
                JOIN pacientes p ON f.id_paciente = p.id_paciente
                ORDER BY f.fecha_factura DESC
            `);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:id/detalle', async (req, res) => {
        try {
            const result = await db.execute(
                `SELECT * FROM detalle_factura WHERE id_factura=:1`,
                [req.params.id]
            );
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/', async (req, res) => {
        const { id_paciente, concepto, cantidad, precio_unitario } = req.body;
        let conn;
        try {
            conn = await db.getConnection();
            const newId    = await conn.execute(`SELECT seq_facturas.NEXTVAL FROM DUAL`);
            const idFactura = newId.rows[0][0];
            const total     = cantidad * precio_unitario;

            await conn.execute(
                `INSERT INTO facturas (id_factura, fecha_factura, total, id_paciente)
                 VALUES (:1, SYSDATE, :2, :3)`,
                [idFactura, total, id_paciente],
                { autoCommit: false }
            );
            await conn.execute(
                `INSERT INTO detalle_factura (id_detalle_factura, id_factura, concepto, cantidad, precio_unitario)
                 VALUES (seq_detalle_factura.NEXTVAL, :1, :2, :3, :4)`,
                [idFactura, concepto, cantidad, precio_unitario],
                { autoCommit: false }
            );
            await conn.commit();
            res.json({ id_factura: idFactura, message: 'Factura creada' });
        } catch (err) {
            if (conn) await conn.rollback();
            res.status(500).json({ error: err.message });
        } finally {
            if (conn) await conn.close();
        }
    });

    return router;
}

// --- REPORTES ---
function buildReportesRouter() {
    const router = express.Router();

    router.get('/citas-por-medico', async (req, res) => {
        try {
            const result = await db.execute(`SELECT * FROM v_reporte_citas`);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/top-pacientes', async (req, res) => {
        try {
            const result = await db.execute(`SELECT * FROM v_top_pacientes WHERE ROWNUM <= 5`);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}


// ============================================================
// ESPECIALIDADES (solo lectura, para poblar selects)
// ============================================================
function buildEspecialidadesRouter() {
    const router = express.Router();
    router.get('/', async (req, res) => {
        try {
            const result = await db.execute(`SELECT id_especialidad, nombre FROM especialidades ORDER BY nombre`);
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return router;
}

// ============================================================
// BOOTSTRAP — Instanciar repos, montar rutas, iniciar app
// ============================================================
async function bootstrap() {
    await db.connect();

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.static('frontend'));

    // Repositorios
    const pacienteRepo    = new PacienteRepository();
    const medicoRepo      = new MedicoRepository();
    const medicamentoRepo = new MedicamentoRepository();
    const usuarioRepo     = new UsuarioRepository();

    // Login (no es CRUD estándar)
    app.post('/api/login', async (req, res) => {
        try {
            const user = await usuarioRepo.findByCredentials(req.body.usuario, req.body.clave);
            if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
            res.json({ id: user[0], usuario: user[1], rol: user[2] });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Rutas generadas por RouterFactory (polimorfismo en acción)
    app.use('/api/pacientes',    RouterFactory.create(pacienteRepo,    { searchEnabled: true }));
    app.use('/api/medicos',      RouterFactory.create(medicoRepo));
    app.use('/api/medicamentos', RouterFactory.create(medicamentoRepo));
    app.use('/api/usuarios',     RouterFactory.create(usuarioRepo));

    // Rutas especiales
    app.use('/api/citas',          buildCitasRouter());
    app.use('/api/facturas',       buildFacturasRouter());
    app.use('/api/reportes',       buildReportesRouter());
    app.use('/api/especialidades', buildEspecialidadesRouter());

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
}

bootstrap().catch(err => {
    console.error('Error al iniciar:', err);
    process.exit(1);
});