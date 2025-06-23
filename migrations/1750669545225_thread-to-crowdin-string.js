/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = pgm => {
  pgm.createTable(
    'thread_to_crowdin_string',
    {
      thread_id: { type: 'text', notNull: true },
      string_id: { type: 'integer', notNull: true },
    },
    {
      primaryKey: ['thread_id', 'string_id'],
    }
  )

  // Optional: Foreign key constraints if you want
  pgm.createIndex('thread_to_crowdin_string', 'thread_id')
  pgm.createIndex('thread_to_crowdin_string', 'string_id')

  pgm.addConstraint('crowdin_strings', 'unique_string_id', {
    unique: ['string_id'],
  })

  pgm.addConstraint('thread_to_crowdin_string', 'fk_string_id', {
    foreignKeys: {
      columns: 'string_id',
      references: 'crowdin_strings(string_id)',
      onDelete: 'CASCADE',
    },
  })
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropTable('thread_to_crowdin_string')
  pgm.dropConstraint('thread_to_crowdin_string', 'fk_string_id')
  pgm.dropConstraint('crowdin_strings', 'fk_string_id')
}
