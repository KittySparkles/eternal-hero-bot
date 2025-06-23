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
    'crowdin_translations',
    {
      string_id: { type: 'integer', notNull: true },
      language: { type: 'text', notNull: true },
      translated_text: { type: 'text', notNull: true },
      last_synced_at: {
        type: 'timestamp with time zone',
        notNull: true,
        default: pgm.func('current_timestamp'),
      },
    },
    {
      primaryKey: ['string_id', 'language'],
    }
  )
}

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = pgm => {
  pgm.dropTable('crowdin_translations')
}
