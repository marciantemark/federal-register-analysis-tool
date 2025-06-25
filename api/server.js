// api/server.js - Federal Register Analysis Tool API Server (Fixed for Your Database)
import { Database } from "bun:sqlite";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import path from "path";

const app = new Hono();

// CORS configuration
app.use('/*', cors({
    origin: ['http://localhost:8000', 'http://localhost:3000', 'http://127.0.0.1:8000'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    credentials: true
}));

// Database configuration
const DB_PATH = process.env.DATABASE_PATH || '../data/databases/CMS-2025-0050-0031.sqlite';


function getDb() {
    try {
        return new Database(DB_PATH);
    } catch (error) {
        console.error('Database connection failed:', error);
        throw new Error(`Could not connect to database at ${DB_PATH}`);
    }
}

// Middleware for error handling
app.use('*', async (c, next) => {
    try {
        await next();
    } catch (error) {
        console.error('API Error:', error);
        return c.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        }, 500);
    }
});

// Health check endpoint
app.get('/health', (c) => {
    return c.json({
        status: 'healthy',
        service: 'Federal Register Analysis API',
        timestamp: new Date().toISOString(),
        database: DB_PATH
    });
});

// Root endpoint with API info
app.get('/', (c) => {
    return c.json({
        name: 'Federal Register Analysis Tool API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            stats: '/api/stats',
            comments: '/api/comments',
            entities: '/api/entities',
            themes: '/api/themes',
            export: '/api/export'
        },
        documentation: 'See README.md for full API documentation'
    });
});

// Get database statistics
app.get('/api/stats', async (c) => {
    const db = getDb();

    try {
        // Get basic counts using actual table structure
        const totalComments = db.prepare("SELECT COUNT(*) as count FROM comments").get()?.count || 0;
        const condensedComments = db.prepare("SELECT COUNT(*) as count FROM condensed_comments WHERE status = 'completed'").get()?.count || 0;

        // Entity and theme counts (tables might not exist)
        let entityCount = 0;
        let themeCount = 0;

        try {
            entityCount = db.prepare("SELECT COUNT(*) as count FROM entity_taxonomy").get()?.count || 0;
        } catch (e) {
            console.log('Entity tables not found');
        }

        try {
            themeCount = db.prepare("SELECT COUNT(*) as count FROM theme_hierarchy").get()?.count || 0;
        } catch (e) {
            console.log('Theme tables not found');
        }

        // Get processing status
        const processingStats = {
            pending: db.prepare("SELECT COUNT(*) as count FROM condensed_comments WHERE status = 'pending'").get()?.count || 0,
            completed: condensedComments,
            failed: db.prepare("SELECT COUNT(*) as count FROM condensed_comments WHERE status = 'failed'").get()?.count || 0
        };

        return c.json({
            success: true,
            data: {
                totalComments,
                condensedComments,
                entities: entityCount,
                themes: themeCount,
                processing: processingStats,
                completionRate: totalComments > 0 ? Math.round((condensedComments / totalComments) * 100) : 0
            },
            timestamp: new Date().toISOString()
        });
    } finally {
        db.close();
    }
});

// Get comments with filtering and pagination (Fixed for your database structure)
app.get('/api/comments', async (c) => {
    const db = getDb();

    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            entity = '',
            category = '',
            status = 'completed'
        } = c.req.query();

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Build dynamic query using your actual table structure
        let whereClause = "WHERE cc.status = ?";
        let params = [status];

        if (search) {
            whereClause += " AND (c.attributes_json LIKE ? OR cc.structured_sections LIKE ?)";
            params.push(`%${search}%`, `%${search}%`);
        }

        if (entity) {
            whereClause += " AND cc.structured_sections LIKE ?";
            params.push(`%${entity}%`);
        }

        // Query using your actual table structure
        const query = `
      SELECT 
        cc.comment_id,
        cc.status,
        cc.structured_sections,
        cc.created_at,
        c.attributes_json,
        c.id as original_id
      FROM condensed_comments cc
      LEFT JOIN comments c ON cc.comment_id = c.id
      ${whereClause}
      ORDER BY cc.created_at DESC
      LIMIT ? OFFSET ?
    `;

        params.push(parseInt(limit), offset);
        const comments = db.prepare(query).all(...params);

        // Get total count for pagination
        const countQuery = `
      SELECT COUNT(*) as total
      FROM condensed_comments cc
      LEFT JOIN comments c ON cc.comment_id = c.id
      ${whereClause}
    `;

        const total = db.prepare(countQuery).get(...params.slice(0, -2))?.total || 0;

        // Process comments to extract data from JSON
        const processedComments = comments.map(comment => {
            let parsed = {};
            let originalData = {};

            try {
                parsed = JSON.parse(comment.structured_sections || '{}');
            } catch (e) {
                console.error(`Error parsing structured sections for ${comment.comment_id}:`, e.message);
            }

            try {
                originalData = JSON.parse(comment.attributes_json || '{}');
            } catch (e) {
                console.error(`Error parsing attributes for ${comment.comment_id}:`, e.message);
            }

            // Extract relevant fields from the JSON
            const extractedComment = {
                ...comment,
                parsed_content: parsed,
                // Extract common fields from attributes_json
                original_text: originalData.comment || originalData.commentText || originalData.content || '',
                submitter_name: originalData.submitterName || originalData.firstName + ' ' + originalData.lastName || '',
                organization_name: originalData.organization || originalData.organizationName || '',
                submission_date: originalData.postedDate || originalData.submissionDate || originalData.datePosted || '',
                comment_url: originalData.commentURL || originalData.url || ''
            };

            return extractedComment;
        });

        return c.json({
            success: true,
            data: {
                comments: processedComments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } finally {
        db.close();
    }
});

// Get specific comment by ID (Fixed for your database structure)
app.get('/api/comments/:id', async (c) => {
    const db = getDb();

    try {
        const commentId = c.req.param('id');

        const comment = db.prepare(`
      SELECT 
        cc.comment_id,
        cc.status,
        cc.structured_sections,
        cc.created_at,
        c.attributes_json,
        c.id as original_id
      FROM condensed_comments cc
      LEFT JOIN comments c ON cc.comment_id = c.id
      WHERE cc.comment_id = ?
    `).get(commentId);

        if (!comment) {
            return c.json({ success: false, error: 'Comment not found' }, 404);
        }

        // Parse JSON data
        let parsed = {};
        let originalData = {};

        try {
            parsed = JSON.parse(comment.structured_sections || '{}');
        } catch (e) {
            console.error(`Error parsing structured sections for ${commentId}:`, e.message);
        }

        try {
            originalData = JSON.parse(comment.attributes_json || '{}');
        } catch (e) {
            console.error(`Error parsing attributes for ${commentId}:`, e.message);
        }

        const processedComment = {
            ...comment,
            parsed_content: parsed,
            original_text: originalData.comment || originalData.commentText || originalData.content || '',
            submitter_name: originalData.submitterName || originalData.firstName + ' ' + originalData.lastName || '',
            organization_name: originalData.organization || originalData.organizationName || '',
            submission_date: originalData.postedDate || originalData.submissionDate || originalData.datePosted || '',
            comment_url: originalData.commentURL || originalData.url || ''
        };

        return c.json({
            success: true,
            data: processedComment
        });
    } finally {
        db.close();
    }
});

// Get all entities (Extract from structured sections since no entity tables)
app.get('/api/entities', async (c) => {
    const db = getDb();

    try {
        let entities = [];

        try {
            // Try to get from entity tables first
            entities = db.prepare(`
        SELECT 
          et.entity_id,
          et.entity_name,
          et.entity_type,
          COUNT(ce.comment_id) as comment_count
        FROM entity_taxonomy et
        LEFT JOIN comment_entities ce ON et.entity_id = ce.entity_id
        GROUP BY et.entity_id, et.entity_name, et.entity_type
        HAVING comment_count > 0
        ORDER BY comment_count DESC
      `).all();
        } catch (e) {
            // Entity tables don't exist, extract from structured sections
            console.log('Entity tables not found, extracting from comments...');

            const comments = db.prepare(`
        SELECT comment_id, structured_sections 
        FROM condensed_comments 
        WHERE status = 'completed' AND structured_sections IS NOT NULL
      `).all();

            const entityMap = new Map();

            comments.forEach(comment => {
                try {
                    const parsed = JSON.parse(comment.structured_sections);

                    // Extract from key points
                    if (parsed.keyPoints && Array.isArray(parsed.keyPoints)) {
                        parsed.keyPoints.forEach(point => {
                            const key = point.trim();
                            if (key && key.length > 2) {
                                if (!entityMap.has(key)) {
                                    entityMap.set(key, { name: key, count: 0, type: 'keypoint' });
                                }
                                entityMap.get(key).count++;
                            }
                        });
                    }

                    // Extract from category
                    if (parsed.category) {
                        const key = parsed.category.trim();
                        if (!entityMap.has(key)) {
                            entityMap.set(key, { name: key, count: 0, type: 'category' });
                        }
                        entityMap.get(key).count++;
                    }

                    // Extract organization names from original comment content
                    if (parsed.detailedContent) {
                        const orgPatterns = /\b([A-Z][a-z]+ (?:Health|Medical|Association|Corp|Inc|LLC|Company|Group|Systems|Administration|Institute|Foundation|Society|Coalition|Alliance|Union|Federation))\b/g;
                        const orgMatches = parsed.detailedContent.match(orgPatterns);
                        if (orgMatches) {
                            orgMatches.forEach(org => {
                                const key = org.trim();
                                if (!entityMap.has(key)) {
                                    entityMap.set(key, { name: key, count: 0, type: 'organization' });
                                }
                                entityMap.get(key).count++;
                            });
                        }
                    }
                } catch (e) {
                    // Skip invalid JSON
                }
            });

            entities = Array.from(entityMap.values())
                .filter(e => e.count > 0)
                .sort((a, b) => b.count - a.count)
                .map(e => ({
                    entity_name: e.name,
                    entity_type: e.type,
                    comment_count: e.count
                }));
        }

        return c.json({
            success: true,
            data: entities
        });
    } finally {
        db.close();
    }
});

// Get themes (if tables exist)
app.get('/api/themes', async (c) => {
    const db = getDb();

    try {
        let themes = [];

        try {
            themes = db.prepare(`
        SELECT 
          th.theme_id,
          th.theme_name,
          th.theme_description,
          COUNT(ct.comment_id) as comment_count
        FROM theme_hierarchy th
        LEFT JOIN comment_themes ct ON th.theme_id = ct.theme_id
        GROUP BY th.theme_id, th.theme_name, th.theme_description
        ORDER BY comment_count DESC
      `).all();
        } catch (e) {
            console.log('Theme tables not found');
        }

        return c.json({
            success: true,
            data: themes
        });
    } finally {
        db.close();
    }
});

// Export data (limited for performance)
app.get('/api/export', async (c) => {
    const db = getDb();

    try {
        const stats = db.prepare("SELECT COUNT(*) as count FROM condensed_comments WHERE status = 'completed'").get();

        if (stats.count > 100) {
            return c.json({
                success: false,
                error: 'Dataset too large for direct export. Use pagination or contact admin.',
                totalComments: stats.count
            }, 400);
        }

        const comments = db.prepare(`
      SELECT 
        cc.comment_id,
        cc.structured_sections,
        cc.created_at,
        c.attributes_json
      FROM condensed_comments cc
      LEFT JOIN comments c ON cc.comment_id = c.id
      WHERE cc.status = 'completed'
      ORDER BY cc.created_at DESC
    `).all();

        const processedComments = comments.map(comment => {
            let parsed = {};
            let originalData = {};

            try {
                parsed = JSON.parse(comment.structured_sections || '{}');
            } catch (e) {
                // Skip invalid JSON
            }

            try {
                originalData = JSON.parse(comment.attributes_json || '{}');
            } catch (e) {
                // Skip invalid JSON
            }

            return {
                ...comment,
                parsed_content: parsed,
                original_text: originalData.comment || originalData.commentText || '',
                submitter_name: originalData.submitterName || '',
                organization_name: originalData.organization || ''
            };
        });

        return c.json({
            success: true,
            data: {
                comments: processedComments,
                exportDate: new Date().toISOString(),
                totalComments: processedComments.length
            }
        });
    } finally {
        db.close();
    }
});

// Start server
const port = process.env.PORT || 3001;

console.log(`🏛️ Federal Register Analysis Tool API`);
console.log(`🚀 Server starting on http://localhost:${port}`);
console.log(`📊 Health check: http://localhost:${port}/health`);
console.log(`📋 API stats: http://localhost:${port}/api/stats`);
console.log(`🗄️ Database: ${DB_PATH}`);

serve({
    fetch: app.fetch,
    port
});