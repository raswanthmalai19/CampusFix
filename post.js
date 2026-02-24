
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
// const upload = require('./multerConfig'); // ADD THIS LINE
// const { ensureContainerExists, uploadFileToBlob, deleteFileFromBlob } = require('./azureStorage'); // ADD THIS LINE
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


// PostgreSQL database connection
// const pool = new Pool({
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     port: process.env.DB_PORT || 5432,
//     max: 10, // connectionLimit
//     idleTimeoutMillis: 30000,
//     connectionTimeoutMillis: 2000,
// });
// Use this for Render deployment
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});


const { BlobServiceClient } = require('@azure/storage-blob');

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient("campusfix");

// Azure Storage functions
async function ensureContainerExists() {
    try {
        await containerClient.createIfNotExists({
            access: 'blob'
        });
        console.log('✅ Azure Blob container "campusfix" is ready');
    } catch (error) {
        console.error('❌ Error creating container:', error);
        throw error;
    }
}

async function uploadFileToBlob(fileBuffer, fileName, contentType) {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
            blobHTTPHeaders: { blobContentType: contentType }
        });
        return fileName;
    } catch (error) {
        console.error('❌ Error uploading to Azure Blob:', error);
        throw error;
    }
}

async function deleteFileFromBlob(fileName) {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        await blockBlobClient.deleteIfExists();
    } catch (error) {
        console.error('❌ Error deleting from Azure Blob:', error);
        throw error;
    }
}


// Configure multer for issue images (similar to profile pictures)

// Add this after Azure Storage code
const multer = require('multer');
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});
// Add this at the top of your server.js to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'c0ddb7740238b153bf072811b270d5669a5abeed716661c7491f6b0f0edd43a3955fdc4e63f4b56a14dec4c866335b66e3b365282f9666843d65bbe603613c39';

// =============================================
// ENHANCED DBMS FEATURES - STORED PROCEDURES
// =============================================

// Initialize stored procedures on server start
async function initializeStoredProcedures() {
    try {
        console.log('🔄 Creating stored procedures...');

        const procedures = [
            `CREATE OR REPLACE FUNCTION sp_distributecreditsadvanced(p_issue_id integer)
            RETURNS void AS $$
            DECLARE
                resolving_supervisor_id integer;
                total_distributed integer;
                deduction_record record;
            BEGIN
                -- Get issue and supervisor info
                SELECT supervisor_id INTO resolving_supervisor_id 
                FROM issues WHERE id = p_issue_id;
                
                IF resolving_supervisor_id IS NOT NULL THEN
                    -- Calculate distribution using advanced logic
                    UPDATE users 
                    SET credits = credits - FLOOR(credits * 0.1) 
                    WHERE role = 'supervisor' AND credits > 0;
                    
                    -- Calculate total distributed amount
                    SELECT SUM(FLOOR(credits * 0.1)) INTO total_distributed
                    FROM users 
                    WHERE role = 'supervisor' AND credits > 0;
                    
                    -- Award to resolving supervisor
                    UPDATE users 
                    SET credits = credits + total_distributed 
                    WHERE id = resolving_supervisor_id;
                    
                    -- Log transactions
                    INSERT INTO credit_transactions (from_supervisor_id, to_supervisor_id, issue_id, amount, transaction_type)
                    SELECT id, resolving_supervisor_id, p_issue_id, FLOOR(credits * 0.1), 'distribution'
                    FROM users WHERE role = 'supervisor' AND FLOOR(credits * 0.1) > 0;
                    
                    INSERT INTO credit_transactions (from_supervisor_id, to_supervisor_id, issue_id, amount, transaction_type)
                    VALUES (NULL, resolving_supervisor_id, p_issue_id, total_distributed, 'reward');
                END IF;
            END;
            $$ LANGUAGE plpgsql;`,

            `CREATE OR REPLACE FUNCTION sp_getsystemstatistics()
            RETURNS TABLE(
                total_users bigint,
                total_supervisors bigint,
                total_students bigint,
                total_issues bigint,
                resolved_issues bigint,
                pending_issues bigint,
                total_credits numeric
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM users WHERE role = 'supervisor') as total_supervisors,
                    (SELECT COUNT(*) FROM users WHERE role = 'user') as total_students,
                    (SELECT COUNT(*) FROM issues) as total_issues,
                    (SELECT COUNT(*) FROM issues WHERE status = 'completed') as resolved_issues,
                    (SELECT COUNT(*) FROM issues WHERE status = 'pending') as pending_issues,
                    (SELECT COALESCE(SUM(credits), 0) FROM users WHERE role = 'supervisor') as total_credits;
            END;
            $$ LANGUAGE plpgsql;`,

            `CREATE OR REPLACE FUNCTION sp_getperformancereport(p_days integer)
            RETURNS TABLE(
                id integer,
                username varchar,
                role user_role,
                issues_handled bigint,
                credits_earned numeric,
                avg_resolution_time_hours numeric
            ) AS $$
            BEGIN
                RETURN QUERY
                SELECT 
                    u.id,
                    u.username,
                    u.role,
                    COUNT(i.id) as issues_handled,
                    COALESCE(SUM(ct.amount), 0) as credits_earned,
                    AVG(EXTRACT(EPOCH FROM (i.updated_at - i.created_at))/3600) as avg_resolution_time_hours
                FROM users u
                LEFT JOIN issues i ON u.id = i.supervisor_id
                LEFT JOIN credit_transactions ct ON u.id = ct.to_supervisor_id
                WHERE i.updated_at >= (CURRENT_TIMESTAMP - (p_days || ' days')::interval)
                GROUP BY u.id, u.username, u.role
                ORDER BY credits_earned DESC;
            END;
            $$ LANGUAGE plpgsql;`
        ];

        for (const procedure of procedures) {
            try {
                await pool.query(procedure);
                console.log('✅ Stored procedure created successfully');
            } catch (error) {
                console.log('⚠️  Procedure might already exist:', error.message);
            }
        }

        console.log('📊 All stored procedures initialized');

    } catch (error) {
        console.log('❌ Error initializing stored procedures:', error.message);
        // Don't throw error, continue server startup
    }
}

// Initialize on server start
initializeStoredProcedures();

// =============================================
// ENHANCED AUTHENTICATION MIDDLEWARE
// =============================================

const authenticateToken = async (req, res, next) => {
    console.log('=== AUTH MIDDLEWARE TRIGGERED ===');
    console.log('Request URL:', req.url);
    console.log('Authorization header:', req.headers['authorization']);

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        console.log('🔐 Verifying token...');
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('✅ Token decoded:', decoded);

        // Enhanced user query with better error handling
        console.log('📊 Checking database connection...');
        const result = await pool.query(
            'SELECT id, username, email, role, credits FROM users WHERE id = $1',
            [decoded.userId]
        );

        console.log('📋 User query result:', result.rows);

        if (result.rows.length === 0) {
            console.log('❌ No user found in database for this token');
            return res.status(403).json({ error: 'Invalid token - user not found' });
        }

        req.user = result.rows[0];
        console.log('✅ Authentication successful for user:', req.user.username);
        next();
    } catch (error) {
        console.error('❌ Token verification failed:', error.message);

        if (error.name === 'TokenExpiredError') {
            console.log('⏰ Token expired at:', error.expiredAt);
            return res.status(403).json({ error: 'Token expired' });
        }
        if (error.name === 'JsonWebTokenError') {
            console.log('🔴 JWT Error:', error.message);
            return res.status(403).json({ error: 'Invalid token format' });
        }

        console.error('Unexpected error:', error);
        return res.status(403).json({ error: 'Authentication failed' });
    }
};

// =============================================
// ENHANCED ADMIN & SUPERVISOR MIDDLEWARE
// =============================================

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

const requireSupervisor = (req, res, next) => {
    if (req.user.role !== 'supervisor' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Supervisor access required' });
    }
    next();
};

// =============================================
// EXISTING ROUTES (UNCHANGED FUNCTIONALITY)
// =============================================

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'user.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/supervisor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'supervisor.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email, role } = req.body;

        const result = await pool.query(
            'SELECT id FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (result.rows.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertResult = await pool.query(
            'INSERT INTO users (username, password, email, role) VALUES ($1, $2, $3, $4) RETURNING id',
            [username, hashedPassword, email, role || 'user']
        );

        res.status(201).json({ message: 'User created successfully', userId: insertResult.rows[0].id });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User login
app.post('/api/login', async (req, res) => {
    try {
        console.log('=== LOGIN ATTEMPT ===');
        console.log('Request body:', req.body);

        const { identifier, username, password } = req.body;
        const userIdentifier = identifier || username;

        if (!userIdentifier || !password) {
            console.log('❌ Missing identifier/username or password');
            return res.status(400).json({ error: 'Identifier/username and password required' });
        }

        console.log('🔌 Testing database connection...');
        try {
            const test = await pool.query('SELECT 1 as test');
            console.log('✅ Database connection successful');
        } catch (dbError) {
            console.error('❌ Database connection failed:', dbError);
            return res.status(500).json({ error: 'Database connection failed' });
        }

        console.log('🔍 Searching for user:', userIdentifier);
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1 OR email = $1',
            [userIdentifier]
        );

        console.log('📊 Users found:', result.rows.length);
        if (result.rows.length === 0) {
            console.log('❌ No user found with identifier:', userIdentifier);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        console.log('✅ User found:', user.username);

        console.log('🔐 Comparing passwords...');
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('Password comparison result:', validPassword);

        if (!validPassword) {
            console.log('❌ Invalid password for user:', user.username);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('🎫 Generating token...');
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log('✅ Login successful for:', user.username);
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                credits: user.credits
            }
        });

    } catch (error) {
        console.error('❌ Login error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// ENHANCED ROUTES WITH ADVANCED DBMS FEATURES
// =============================================

// Get all issues with advanced filtering
app.get('/api/issues', authenticateToken, async (req, res) => {
    try {
        const { search, category, status, sortBy } = req.query;

        let query = `
            SELECT i.*, c.name as category_name, u.username as user_name 
            FROM issues i 
            LEFT JOIN categories c ON i.category_id = c.id 
            LEFT JOIN users u ON i.user_id = u.id 
        `;

        const params = [];
        const conditions = [];

        // Advanced filtering
        if (search) {
            conditions.push('(i.title ILIKE $' + (params.length + 1) + ' OR i.description ILIKE $' + (params.length + 2) + ')');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (category) {
            conditions.push('i.category_id = $' + (params.length + 1));
            params.push(category);
        }
        if (status) {
            conditions.push('i.status = $' + (params.length + 1));
            params.push(status);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Advanced sorting
        const sortOptions = {
            'newest': 'i.created_at DESC',
            'oldest': 'i.created_at ASC',
            'most_voted': '(i.upvotes - i.downvotes) DESC',
            'most_comments': '(SELECT COUNT(*) FROM comments WHERE issue_id = i.id) DESC'
        };

        query += ` ORDER BY ${sortOptions[sortBy] || 'i.created_at DESC'}`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get issues error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Enhanced credit distribution using stored procedure
async function distributeCredits(issueId) {
    const client = await pool.connect();
    try {
        console.log('💰 Using advanced credit distribution procedure...');

        // Use the stored procedure instead of manual transaction
        await client.query('SELECT sp_distributecreditsadvanced($1)', [issueId]);

        console.log('✅ Advanced credit distribution completed');
    } catch (error) {
        console.error('❌ Credit distribution error:', error);
        // Fallback to original method if stored procedure fails
        await originalDistributeCredits(issueId);
    } finally {
        client.release();
    }
}

// Original distribution method (as fallback)
async function originalDistributeCredits(issueId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            'SELECT supervisor_id FROM issues WHERE id = $1',
            [issueId]
        );

        if (result.rows.length === 0) return;

        const issue = result.rows[0];
        const resolvingSupervisorId = issue.supervisor_id;

        if (!resolvingSupervisorId) return;

        const supervisorsResult = await client.query(
            'SELECT id, credits FROM users WHERE role = $1',
            ['supervisor']
        );

        if (supervisorsResult.rows.length === 0) return;

        const creditDeductions = supervisorsResult.rows.map(s => ({
            id: s.id,
            deduction: Math.floor(s.credits * 0.1)
        }));

        const totalAward = creditDeductions.reduce((sum, d) => sum + d.deduction, 0);

        for (const deduction of creditDeductions) {
            if (deduction.deduction > 0) {
                await client.query(
                    'UPDATE users SET credits = credits - $1 WHERE id = $2',
                    [deduction.deduction, deduction.id]
                );

                await client.query(
                    'INSERT INTO credit_transactions (from_supervisor_id, to_supervisor_id, issue_id, amount, transaction_type) VALUES ($1, $2, $3, $4, $5)',
                    [deduction.id, resolvingSupervisorId, issueId, deduction.deduction, 'distribution']
                );
            }
        }

        await client.query(
            'UPDATE users SET credits = credits + $1 WHERE id = $2',
            [totalAward, resolvingSupervisorId]
        );

        await client.query(
            'INSERT INTO credit_transactions (from_supervisor_id, to_supervisor_id, issue_id, amount, transaction_type) VALUES ($1, $2, $3, $4, $5)',
            [null, resolvingSupervisorId, issueId, totalAward, 'reward']
        );

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Credit distribution error:', error);
    } finally {
        client.release();
    }
}

// =============================================
// NEW ADVANCED DBMS ROUTES
// =============================================

// Get advanced system statistics using stored procedure
app.get('/api/statistics/advanced', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sp_getsystemstatistics()');
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get advanced statistics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get supervisor performance reports
app.get('/api/reports/supervisor-performance', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM sp_getperformancereport(30)');
        res.json(result.rows);
    } catch (error) {
        console.error('Get supervisor performance error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Enhanced search with full-text capabilities
app.get('/api/search/issues', authenticateToken, async (req, res) => {
    try {
        const { q, category, status, dateFrom, dateTo } = req.query;

        let query = `
            SELECT i.*, c.name as category_name, u.username as user_name,
            (SELECT COUNT(*) FROM comments WHERE issue_id = i.id) as comment_count
            FROM issues i 
            LEFT JOIN categories c ON i.category_id = c.id 
            LEFT JOIN users u ON i.user_id = u.id 
        `;

        const params = [];
        const conditions = [];

        if (q) {
            conditions.push('(to_tsvector(\'english\', i.title || \' \' || i.description) @@ to_tsquery(\'english\', $' + (params.length + 1) + '))');
            params.push(q);
        }
        if (category) {
            conditions.push('i.category_id = $' + (params.length + 1));
            params.push(category);
        }
        if (status) {
            conditions.push('i.status = $' + (params.length + 1));
            params.push(status);
        }
        if (dateFrom) {
            conditions.push('DATE(i.created_at) >= $' + (params.length + 1));
            params.push(dateFrom);
        }
        if (dateTo) {
            conditions.push('DATE(i.created_at) <= $' + (params.length + 1));
            params.push(dateTo);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY i.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Advanced search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Database performance metrics
app.get('/api/admin/database-metrics', authenticateToken, requireAdmin, async (req, res) => {
    try {
        // Get table sizes and row counts
        const tableStats = await pool.query(`
            SELECT 
                table_name,
                (xpath('/row/cnt/text()', query_to_xml(format('SELECT count(*) as cnt FROM %I', table_name), false, true, '')))[1]::text::bigint as row_count,
                pg_size_pretty(pg_total_relation_size(table_name)) as size
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY pg_total_relation_size(table_name) DESC
        `);

        res.json({
            tableStatistics: tableStats.rows,
            database: process.env.DB_NAME
        });
    } catch (error) {
        console.error('Get database metrics error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================
// EXISTING ROUTES (KEPT UNCHANGED FUNCTIONALITY)
// =============================================

// Create a new issue
app.post('/api/issues', authenticateToken, upload.single('issueImage'), async (req, res) => {
    const client = await pool.connect();
    try {
        console.log('=== CREATE ISSUE START ===');
        console.log('User:', req.user.id);
        console.log('File:', req.file ? `Present (${req.file.originalname})` : 'Not present');

        const { title, description, category_id } = req.body;

        // Validate required fields
        if (!title || !description || !category_id) {
            return res.status(400).json({
                error: 'Title, description, and category are required'
            });
        }

        let imageUrl = null;

        // Handle image upload if present
        if (req.file) {
            console.log('Processing issue image upload...');

            // Generate unique filename for issue images
            const fileExtension = req.file.originalname.split('.').pop();
            const fileName = `issue-${req.user.id}-${Date.now()}.${fileExtension}`;

            // Upload to Azure Blob Storage (use the same uploadFileToBlob function)
            const uploadedFileName = await uploadFileToBlob(
                req.file.buffer,
                fileName,
                req.file.mimetype
            );

            imageUrl = `https://campusfixstorage.blob.core.windows.net/campusfix/${uploadedFileName}`;
            console.log('Issue image uploaded:', imageUrl);
        }

        // Insert issue into database with image_url
        const result = await client.query(
            `INSERT INTO issues (title, description, category_id, user_id, image_url) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [title, description, category_id, req.user.id, imageUrl]
        );

        const newIssue = result.rows[0];

        // Get category name and user name for response
        const issueWithDetails = await client.query(`
            SELECT i.*, c.name as category_name, u.username as user_name 
            FROM issues i 
            LEFT JOIN categories c ON i.category_id = c.id 
            LEFT JOIN users u ON i.user_id = u.id 
            WHERE i.id = $1
        `, [newIssue.id]);

        console.log('✅ Issue created successfully');
        res.status(201).json(issueWithDetails.rows[0]);

    } catch (error) {
        console.error('❌ Error creating issue:', error);
        res.status(500).json({
            error: 'Failed to create issue',
            details: error.message
        });
    } finally {
        client.release();
        console.log('=== CREATE ISSUE COMPLETE ===\n');
    }
});
// Update issue status (for supervisors/admins)
app.put('/api/issues/:id/status', authenticateToken, requireSupervisor, async (req, res) => {
    try {
        const { status } = req.body;
        const issueId = req.params.id;

        if (status === 'processing') {
            await pool.query(
                'UPDATE issues SET status = $1, supervisor_id = $2 WHERE id = $3',
                [status, req.user.id, issueId]
            );
        } else {
            await pool.query(
                'UPDATE issues SET status = $1 WHERE id = $2',
                [status, issueId]
            );
        }

        // ADD THIS SECTION FOR EMAIL NOTIFICATION
        if (status === 'completed') {
            await distributeCredits(issueId);

            // Get issue details and user email for notification
            const issueResult = await pool.query(`
                SELECT i.*, u.email as user_email, u2.username as resolved_by 
                FROM issues i 
                JOIN users u ON i.user_id = u.id 
                LEFT JOIN users u2 ON i.supervisor_id = u2.id 
                WHERE i.id = $1
            `, [issueId]);

            if (issueResult.rows.length > 0) {
                const issue = issueResult.rows[0];
                // const { sendIssueCompletionEmail } = require('./utils/emailService');

                // Send email notification (fire and forget - don't await)
                sendIssueCompletionEmail(
                    issue.user_email,
                    issue.title,
                    issue.description,
                    issue.resolved_by || 'Support Team'
                ).catch(err => console.error('Email failed:', err));
            }
        }

        res.json({ message: 'Issue status updated successfully' });
    } catch (error) {
        console.error('Update issue status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Vote on an issue
app.post('/api/issues/:id/vote', authenticateToken, async (req, res) => {
    try {
        const { voteType } = req.body;
        const issueId = req.params.id;

        const result = await pool.query(
            'SELECT id, vote_type FROM issue_votes WHERE issue_id = $1 AND user_id = $2',
            [issueId, req.user.id]
        );

        if (result.rows.length > 0) {
            const existingVote = result.rows[0];

            if (existingVote.vote_type === voteType) {
                await pool.query(
                    'DELETE FROM issue_votes WHERE id = $1',
                    [existingVote.id]
                );

                await pool.query(
                    `UPDATE issues SET ${voteType}s = ${voteType}s - 1 WHERE id = $1`,
                    [issueId]
                );
            } else {
                await pool.query(
                    'UPDATE issue_votes SET vote_type = $1 WHERE id = $2',
                    [voteType, existingVote.id]
                );

                await pool.query(
                    `UPDATE issues SET ${voteType}s = ${voteType}s + 1, 
                    ${existingVote.vote_type}s = ${existingVote.vote_type}s - 1 WHERE id = $1`,
                    [issueId]
                );
            }
        } else {
            await pool.query(
                'INSERT INTO issue_votes (issue_id, user_id, vote_type) VALUES ($1, $2, $3)',
                [issueId, req.user.id, voteType]
            );

            await pool.query(
                `UPDATE issues SET ${voteType}s = ${voteType}s + 1 WHERE id = $1`,
                [issueId]
            );
        }

        res.json({ message: 'Vote recorded successfully' });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add comment to issue
app.post('/api/issues/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { comment } = req.body;
        const issueId = req.params.id;

        await pool.query(
            'INSERT INTO comments (issue_id, user_id, comment) VALUES ($1, $2, $3)',
            [issueId, req.user.id, comment]
        );

        res.status(201).json({ message: 'Comment added successfully' });
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get comments for an issue
app.get('/api/issues/:id/comments', authenticateToken, async (req, res) => {
    try {
        const issueId = req.params.id;

        const result = await pool.query(`
            SELECT c.*, u.username 
            FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.issue_id = $1 
            ORDER BY c.created_at ASC
        `, [issueId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all categories
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM categories');
        res.json(result.rows);
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all supervisors
app.get('/api/supervisors', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email FROM users WHERE role = $1',
            ['supervisor']
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get supervisors error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's votes
app.get('/api/users/:id/votes', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.id;

        if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await pool.query(
            'SELECT * FROM issue_votes WHERE user_id = $1',
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error('Get user votes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all supervisor assignments
app.get('/api/assignments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('📋 Fetching supervisor assignments...');
        const result = await pool.query(`
            SELECT sc.*, u.username as supervisor_name, c.name as category_name
            FROM supervisor_categories sc
            JOIN users u ON sc.supervisor_id = u.id
            JOIN categories c ON sc.category_id = c.id
            ORDER BY sc.created_at DESC
        `);
        console.log(`✅ Found ${result.rows.length} assignments`);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Get assignments error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create supervisor assignment
app.post('/api/assignments', authenticateToken, requireAdmin, async (req, res) => {
    try {
        console.log('➕ Creating new supervisor assignment...');
        console.log('Request body:', req.body);

        const { supervisor_id, category_id } = req.body;

        if (!supervisor_id || !category_id) {
            console.log('❌ Missing supervisor_id or category_id');
            return res.status(400).json({ error: 'supervisor_id and category_id are required' });
        }

        const existing = await pool.query(
            'SELECT id FROM supervisor_categories WHERE supervisor_id = $1 AND category_id = $2',
            [supervisor_id, category_id]
        );

        if (existing.rows.length > 0) {
            console.log('❌ Assignment already exists');
            return res.status(400).json({ error: 'This supervisor is already assigned to this category' });
        }

        const insertResult = await pool.query(
            'INSERT INTO supervisor_categories (supervisor_id, category_id) VALUES ($1, $2) RETURNING id',
            [supervisor_id, category_id]
        );

        console.log('✅ Assignment created successfully, ID:', insertResult.rows[0].id);
        res.status(201).json({
            message: 'Supervisor assigned to category successfully',
            assignmentId: insertResult.rows[0].id
        });
    } catch (error) {
        console.error('❌ Assign supervisor error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Remove supervisor assignment
app.delete('/api/assignments/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const assignmentId = req.params.id;
        console.log('🗑️ Deleting assignment ID:', assignmentId);

        const result = await pool.query(
            'DELETE FROM supervisor_categories WHERE id = $1',
            [assignmentId]
        );

        if (result.rowCount === 0) {
            console.log('❌ Assignment not found');
            return res.status(404).json({ error: 'Assignment not found' });
        }

        console.log('✅ Assignment deleted successfully');
        res.json({ message: 'Assignment removed successfully' });
    } catch (error) {
        console.error('❌ Remove assignment error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create category (Admin only)
app.post('/api/categories', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const result = await pool.query(
            'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING id',
            [name, description || null]
        );

        res.status(201).json({
            message: 'Category created successfully',
            categoryId: result.rows[0].id
        });
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete category (Admin only)
app.delete('/api/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const categoryId = req.params.id;

        const issues = await pool.query(
            'SELECT id FROM issues WHERE category_id = $1 LIMIT 1',
            [categoryId]
        );

        if (issues.rows.length > 0) {
            return res.status(400).json({
                error: 'Cannot delete category - it is being used by existing issues'
            });
        }

        const result = await pool.query(
            'DELETE FROM categories WHERE id = $1',
            [categoryId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user (Admin only - for deleting supervisors)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;

        const users = await pool.query(
            'SELECT id, role FROM users WHERE id = $1',
            [userId]
        );

        if (users.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users.rows[0];

        if (user.role === 'supervisor') {
            const assignments = await pool.query(
                'SELECT id FROM supervisor_categories WHERE supervisor_id = $1 LIMIT 1',
                [userId]
            );

            if (assignments.rows.length > 0) {
                return res.status(400).json({
                    error: 'Cannot delete supervisor - remove category assignments first'
                });
            }

            const issues = await pool.query(
                'SELECT id FROM issues WHERE supervisor_id = $1 LIMIT 1',
                [userId]
            );

            if (issues.rows.length > 0) {
                return res.status(400).json({
                    error: 'Cannot delete supervisor - reassign their issues first'
                });
            }
        }

        const result = await pool.query(
            'DELETE FROM users WHERE id = $1',
            [userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update category (Admin only)
app.put('/api/categories/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const categoryId = req.params.id;
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        const result = await pool.query(
            'UPDATE categories SET name = $1, description = $2 WHERE id = $3',
            [name, description || null, categoryId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }

        res.json({ message: 'Category updated successfully' });
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users (Admin only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, role, credits, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get supervisor's assigned categories
app.get('/api/supervisor/categories', authenticateToken, requireSupervisor, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.* 
            FROM supervisor_categories sc
            JOIN categories c ON sc.category_id = c.id
            WHERE sc.supervisor_id = $1
            ORDER BY c.name
        `, [req.user.id]);

        res.json(result.rows);
    } catch (error) {
        console.error('Get supervisor categories error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get current user data
app.get('/api/users/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            role: req.user.role,
            credits: req.user.credits
        });
    } catch (error) {
        console.error('Get user data error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email } = req.body;
        const userId = req.user.id;

        // Check if username/email already exists (excluding current user)
        const existing = await pool.query(
            'SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3',
            [username, email, userId]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        await pool.query(
            'UPDATE users SET username = $1, email = $2 WHERE id = $3',
            [username, email, userId]
        );

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user password
app.put('/api/users/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        // Verify current password
        const user = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);

        if (!validPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user settings (you can extend this based on what settings you want)
app.get('/api/users/settings', authenticateToken, async (req, res) => {
    try {
        // For now, return basic settings structure
        res.json({
            notifications: true,
            emailUpdates: true,
            theme: 'light'
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user settings
app.put('/api/users/settings', authenticateToken, async (req, res) => {
    try {
        const { notifications, emailUpdates, theme } = req.body;

        // In a real app, you'd store these in a user_settings table
        // For now, we'll just return success
        res.json({ message: 'Settings updated successfully' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Upload profile picture - UPDATED WITH CORRECT CONTAINER
// app.post('/api/users/profile/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
//     const client = await pool.connect();
//     try {
//         console.log('📸 Profile picture upload request received');

//         if (!req.file) {
//             return res.status(400).json({ error: 'No file uploaded' });
//         }

//         // Get current user to check existing profile picture
//         const userResult = await client.query(
//             'SELECT profile_picture FROM users WHERE id = $1',
//             [req.user.id]
//         );

//         if (userResult.rows.length === 0) {
//             return res.status(404).json({ error: 'User not found' });
//         }

//         const currentUser = userResult.rows[0];

//         // Generate unique filename
//         const fileExtension = req.file.originalname.split('.').pop();
//         const fileName = `profile-${req.user.id}-${Date.now()}.${fileExtension}`;

//         // Upload to Azure Blob Storage
//         const uploadedFileName = await uploadFileToBlob(
//             req.file.buffer,
//             fileName,
//             req.file.mimetype
//         );

//         // Delete old profile picture if exists
//         if (currentUser.profile_picture) {
//             try {
//                 await deleteFileFromBlob(currentUser.profile_picture);
//             } catch (error) {
//                 console.error('⚠️ Error deleting old profile picture:', error.message);
//             }
//         }

//         // Update user profile with new picture in database
//         await client.query(
//             'UPDATE users SET profile_picture = $1 WHERE id = $2',
//             [uploadedFileName, req.user.id]
//         );

//         res.json({
//             message: 'Profile picture updated successfully',
//             profilePicture: uploadedFileName,
//             profilePictureUrl: `https://campusfixstorage.blob.core.windows.net/campusfix/${uploadedFileName}` // UPDATED
//         });

//     } catch (error) {
//         console.error('❌ Profile picture upload error:', error);
//         res.status(500).json({ error: 'Failed to upload profile picture' });
//     } finally {
//         client.release();
//     }
// });
app.post('/api/users/profile/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    const client = await pool.connect();
    try {
        console.log('=== PROFILE PICTURE UPLOAD START ===');
        console.log('User:', req.user.id, req.user.username);
        console.log('Headers:', {
            'content-type': req.headers['content-type'],
            'content-length': req.headers['content-length'],
            'authorization': req.headers['authorization'] ? 'Present' : 'Missing'
        });

        // Check if multer processed the file
        if (!req.file) {
            console.log('❌ Multer did not process any file');
            console.log('Request body:', req.body);
            console.log('Request files:', req.files);
            return res.status(400).json({
                error: 'No file uploaded or file processing failed',
                details: 'Make sure you are sending a file with field name "profilePicture"'
            });
        }

        console.log('✅ File processed by multer:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            bufferLength: req.file.buffer?.length
        });

        // Validate file type
        if (!req.file.mimetype.startsWith('image/')) {
            console.log('❌ Invalid file type:', req.file.mimetype);
            return res.status(400).json({ error: 'Only image files are allowed' });
        }

        // Validate file size
        if (req.file.size > 5 * 1024 * 1024) {
            console.log('❌ File too large:', req.file.size);
            return res.status(400).json({ error: 'File size must be less than 5MB' });
        }

        // Test database connection
        console.log('🔌 Testing database connection...');
        const dbTest = await client.query('SELECT 1 as test');
        console.log('✅ Database connection OK');

        // Get current user
        console.log('📊 Fetching current user data...');
        const userResult = await client.query(
            'SELECT profile_picture FROM users WHERE id = $1',
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            console.log('❌ User not found in database');
            return res.status(404).json({ error: 'User not found' });
        }

        const currentUser = userResult.rows[0];
        console.log('✅ Current user found, existing picture:', currentUser.profile_picture);

        // Generate unique filename
        const fileExtension = req.file.originalname.split('.').pop();
        const fileName = `profile-${req.user.id}-${Date.now()}.${fileExtension}`;
        console.log('📁 Generated filename:', fileName);

        // Test Azure connection
        console.log('☁️ Testing Azure Storage connection...');
        try {
            await ensureContainerExists();
            console.log('✅ Azure container ready');
        } catch (azureError) {
            console.error('❌ Azure connection failed:', azureError);
            throw new Error('Storage service unavailable');
        }

        // Upload to Azure Blob Storage
        console.log('⬆️ Uploading to Azure Blob Storage...');
        const uploadedFileName = await uploadFileToBlob(
            req.file.buffer,
            fileName,
            req.file.mimetype
        );
        console.log('✅ File uploaded to Azure:', uploadedFileName);

        // Delete old profile picture if exists
        if (currentUser.profile_picture) {
            try {
                console.log('🗑️ Deleting old profile picture:', currentUser.profile_picture);
                await deleteFileFromBlob(currentUser.profile_picture);
                console.log('✅ Old picture deleted');
            } catch (deleteError) {
                console.error('⚠️ Error deleting old profile picture:', deleteError.message);
                // Continue even if deletion fails
            }
        }

        // Update database
        console.log('💾 Updating database...');
        await client.query(
            'UPDATE users SET profile_picture = $1 WHERE id = $2',
            [uploadedFileName, req.user.id]
        );
        console.log('✅ Database updated');

        const profilePictureUrl = `https://campusfixstorage.blob.core.windows.net/campusfix/${uploadedFileName}`;

        console.log('=== PROFILE PICTURE UPLOAD SUCCESS ===');
        console.log('User:', req.user.id);
        console.log('New picture URL:', profilePictureUrl);

        res.json({
            message: 'Profile picture updated successfully',
            profilePicture: uploadedFileName,
            profilePictureUrl: profilePictureUrl
        });

    } catch (error) {
        console.error('=== PROFILE PICTURE UPLOAD ERROR ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        // Check for specific Azure errors
        if (error.message.includes('Azure') || error.message.includes('ECONNREFUSED')) {
            console.error('❌ Azure Storage connection failed');
            res.status(500).json({
                error: 'Storage service unavailable',
                details: 'Cannot connect to file storage'
            });
        } else if (error.message.includes('credential')) {
            console.error('❌ Azure credentials error');
            res.status(500).json({
                error: 'Storage configuration error',
                details: 'Check Azure Storage credentials'
            });
        } else {
            console.error('❌ Unexpected error:', error);
            res.status(500).json({
                error: 'Failed to upload profile picture',
                details: error.message
            });
        }
    } finally {
        client.release();
        console.log('=== PROFILE PICTURE UPLOAD COMPLETE ===\n');
    }
});

// Get profile picture URL - UPDATED WITH CORRECT CONTAINER
app.get('/api/users/profile/picture', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT profile_picture FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0 || !result.rows[0].profile_picture) {
            return res.status(404).json({ error: 'Profile picture not found' });
        }

        const profilePicture = result.rows[0].profile_picture;
        const profilePictureUrl = `https://campusfixstorage.blob.core.windows.net/campusfix/${profilePicture}`; // UPDATED

        res.json({
            profilePicture: profilePicture,
            profilePictureUrl: profilePictureUrl
        });

    } catch (error) {
        console.error('Get profile picture error:', error);
        res.status(500).json({ error: 'Failed to get profile picture' });
    }
});
app.get('/api/debug/azure-connection', async (req, res) => {
    try {
        console.log('🔗 Testing Azure connection from Render.com...');

        const { BlobServiceClient } = require('@azure/storage-blob');

        // Use the same connection string as your upload route
        const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient("campusfix");

        // Test 1: Check if container exists
        console.log('📦 Checking container...');
        const containerExists = await containerClient.exists();
        console.log('Container exists:', containerExists);

        // Test 2: List blobs
        console.log('📂 Listing blobs...');
        const blobs = [];
        for await (const blob of containerClient.listBlobsFlat()) {
            blobs.push({
                name: blob.name,
                size: blob.properties.contentLength
            });
        }

        // Test 3: Try to upload a small test file
        console.log('⬆️ Testing upload...');
        const testFileName = `test-${Date.now()}.txt`;
        const testContent = "Hello from Render.com";

        const blockBlobClient = containerClient.getBlockBlobClient(testFileName);
        await blockBlobClient.upload(testContent, Buffer.byteLength(testContent), {
            blobHTTPHeaders: { blobContentType: 'text/plain' }
        });

        console.log('✅ Test file uploaded');

        // Clean up
        await blockBlobClient.delete();
        console.log('🗑️ Test file deleted');

        res.json({
            status: 'SUCCESS',
            containerExists: containerExists,
            existingBlobs: blobs,
            testUpload: 'worked',
            message: 'Azure Storage is working from Render.com!'
        });

    } catch (error) {
        console.error('❌ Azure test failed:', error);
        res.json({
            status: 'FAILED',
            error: error.message,
            details: error.toString(),
            message: 'Azure Storage connection failed from Render.com'
        });
    }
});
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendIssueCompletionEmail(userEmail, issueTitle, issueDescription, resolvedBy) {
    try {
        // For development: only send to verified email addresses
        const verifiedEmails = ['bharadwaj5464@gmail.com']; // Your verified email

        if (!verifiedEmails.includes(userEmail)) {
            console.log('📧 Email not sent (unverified recipient in development):', userEmail);
            console.log('📋 Would have sent:', {
                to: userEmail,
                subject: `Issue Resolved: ${issueTitle}`,
                resolvedBy: resolvedBy
            });
            return true; // Return true to simulate success
        }

        const { data, error } = await resend.emails.send({
            from: 'CampusFix <onboarding@resend.dev>',
            to: userEmail,
            subject: `Issue Resolved: ${issueTitle}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4CAF50;">🎉 Issue Resolved!</h2>
                    <p>Your issue has been successfully resolved by our team.</p>
                    
                    <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Issue Details:</h3>
                        <p><strong>Title:</strong> ${issueTitle}</p>
                        <p><strong>Description:</strong> ${issueDescription}</p>
                        <p><strong>Resolved By:</strong> ${resolvedBy}</p>
                        <p><strong>Status:</strong> ✅ Completed</p>
                    </div>
                    
                    <p>Thank you for using CampusFix!</p>
                </div>
            `
        });

        if (error) {
            console.error('❌ Email sending error:', error);
            return false;
        }

        console.log('✅ Issue completion email sent to:', userEmail);
        return true;
    } catch (error) {
        console.error('❌ Email service error:', error);
        return false;
    }
}
module.exports = { sendIssueCompletionEmail };

app.use(express.static('public'));
// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Advanced DBMS features enabled`);
    console.log(`🔧 Stored Procedures: Credit Distribution, System Statistics, Performance Reports`);
    console.log(`📈 Enhanced: Search, Filtering, Analytics, Database Metrics`);
});
// ,gc,nc,df;ug