/**
 * PostgreSQL Database Client
 * Replaces Supabase client with direct PostgreSQL connection
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://paper_reader:changeme@postgres:5432/paper_reader',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

/**
 * Execute a query against the database
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    console.error('Query error', { text, error });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close all connections (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

// Database helper functions

/**
 * Papers
 */
export const papers = {
  async findAll() {
    const result = await query(
      `SELECT * FROM papers_with_tags ORDER BY upload_date DESC`
    );
    return result.rows;
  },

  async findById(id: string) {
    const result = await query(
      `SELECT * FROM papers_with_tags WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async create(data: {
    title: string;
    authors?: string;
    abstract?: string;
    publicationDate?: Date;
    doi?: string;
    pdfFilePath: string;
    totalPages: number;
    extractedText?: string;
    metadata?: any;
  }) {
    const result = await query(
      `INSERT INTO papers (
        title, authors, abstract, publication_date, doi,
        pdf_file_path, total_pages, extracted_text, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.title,
        data.authors,
        data.abstract,
        data.publicationDate,
        data.doi,
        data.pdfFilePath,
        data.totalPages,
        data.extractedText,
        data.metadata || {}
      ]
    );
    return result.rows[0];
  },

  async update(id: string, data: Partial<{
    title: string;
    readingProgress: number;
    ttsStatus: string;
    ttsError: string;
  }>) {
    const sets: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        sets.push(`${dbKey} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (sets.length === 0) return null;

    values.push(id);
    const result = await query(
      `UPDATE papers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  },

  async delete(id: string) {
    await query(`DELETE FROM papers WHERE id = $1`, [id]);
  },

  async search(searchQuery: string) {
    const result = await query(
      `SELECT * FROM search_papers($1)`,
      [searchQuery]
    );
    return result.rows;
  }
};

/**
 * Paper Chunks
 */
export const paperChunks = {
  async findByPaperId(paperId: string) {
    const result = await query(
      `SELECT * FROM paper_chunks WHERE paper_id = $1 ORDER BY chunk_index`,
      [paperId]
    );
    return result.rows;
  },

  async create(data: {
    paperId: string;
    chunkIndex: number;
    chunkType?: string;
    sectionTitle?: string;
    textContent: string;
    startPage?: number;
    endPage?: number;
    wordCount?: number;
    charCount?: number;
  }) {
    const result = await query(
      `INSERT INTO paper_chunks (
        paper_id, chunk_index, chunk_type, section_title,
        text_content, start_page, end_page, word_count, char_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.paperId,
        data.chunkIndex,
        data.chunkType || 'paragraph',
        data.sectionTitle,
        data.textContent,
        data.startPage,
        data.endPage,
        data.wordCount,
        data.charCount
      ]
    );
    return result.rows[0];
  },

  async updateAudio(id: string, audioFilePath: string, duration: number) {
    const result = await query(
      `UPDATE paper_chunks
       SET audio_file_path = $1, audio_duration = $2, tts_status = 'completed', updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [audioFilePath, duration, id]
    );
    return result.rows[0];
  }
};

/**
 * Notes
 */
export const notes = {
  async findByPaperId(paperId: string) {
    const result = await query(
      `SELECT * FROM notes WHERE paper_id = $1 ORDER BY created_at DESC`,
      [paperId]
    );
    return result.rows;
  },

  async create(data: {
    paperId: string;
    chunkId?: string;
    noteType: 'text' | 'voice';
    content?: string;
    voiceFilePath?: string;
    voiceDuration?: number;
    positionData?: any;
    contextText?: string;
  }) {
    const result = await query(
      `INSERT INTO notes (
        paper_id, chunk_id, note_type, content,
        voice_file_path, voice_duration, position_data, context_text
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        data.paperId,
        data.chunkId,
        data.noteType,
        data.content,
        data.voiceFilePath,
        data.voiceDuration,
        data.positionData || {},
        data.contextText
      ]
    );
    return result.rows[0];
  },

  async delete(id: string) {
    await query(`DELETE FROM notes WHERE id = $1`, [id]);
  }
};

/**
 * Tags
 */
export const tags = {
  async findAll() {
    const result = await query(`SELECT * FROM tags ORDER BY name`);
    return result.rows;
  },

  async create(name: string, color?: string) {
    const result = await query(
      `INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *`,
      [name, color || '#3B82F6']
    );
    return result.rows[0];
  },

  async addToPaper(paperId: string, tagId: string) {
    await query(
      `INSERT INTO paper_tags (paper_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [paperId, tagId]
    );
  },

  async removeFromPaper(paperId: string, tagId: string) {
    await query(
      `DELETE FROM paper_tags WHERE paper_id = $1 AND tag_id = $2`,
      [paperId, tagId]
    );
  }
};

export default {
  query,
  getClient,
  transaction,
  closePool,
  papers,
  paperChunks,
  notes,
  tags
};
