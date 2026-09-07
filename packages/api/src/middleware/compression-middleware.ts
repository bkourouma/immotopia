import compression from 'compression';

/**
 * Response compression middleware
 * Compresses response bodies to reduce bandwidth
 */
export const compressionMiddleware = compression({
  level: 6, // Compression level (1-9, 6 is a good balance)
  filter: (req, res) => {
    // Don't compress if response has Cache-Control: no-transform
    if (req.headers['cache-control']?.includes('no-transform')) {
      return false;
    }
    // Use compression default filter
    return compression.filter(req, res);
  }
});
