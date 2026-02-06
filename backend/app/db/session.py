from contextlib import contextmanager
import time
import logging
import psycopg
from app.core.config import settings

logger = logging.getLogger(__name__)

@contextmanager
def get_db_connection(jwt_claims: str):
    """
    Manage the PostgreSQL connection with the JWT passed in the session.
    """
    # Force IPv4 by adding hostaddr (resolved manually).
    # Parse DATABASE_URL to extract components and inject hostaddr.
    # Parse DATABASE_URL using urllib to handle special characters correctly
    from urllib.parse import urlparse, unquote
    
    try:
        url = urlparse(settings.DATABASE_URL)
        if url.scheme != 'postgresql':
             raise ValueError("Scheme must be postgresql")
        
        user = unquote(url.username) if url.username else None
        password = unquote(url.password) if url.password else None
        host = url.hostname
        port = url.port
        dbname = url.path.lstrip('/')
    except Exception:
        raise ValueError("DATABASE_URL format invalide")
    
    if not (user and host and dbname):
         raise ValueError("DATABASE_URL incomplete")
    
    # Manual DNS resolution to force IPv4.
    import socket
    try:
        # Forcer IPv4 avec AF_INET
        ipv4 = socket.getaddrinfo(host, None, socket.AF_INET)[0][4][0]
        logger.debug("Resolved %s -> IPv4: %s", host, ipv4)
    except socket.gaierror:
        logger.warning("Unable to resolve %s to IPv4, using hostname fallback", host)
        ipv4 = host  # Fallback to hostname on failure.
    
    # Construire la connection string avec hostaddr
    conn_params = {
        "user": user,
        "password": password,
        "host": host,
        "hostaddr": ipv4,  # FORCE l'utilisation de l'IPv4
        "port": port,
        "dbname": dbname.split('?')[0],  # Remove query params (e.g. ?pgbouncer=true).
        "options": "-c search_path=public -c statement_timeout=30000",
        "sslmode": "require",
        "connect_timeout": 10,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
    }
    
    # Pooler endpoints can break server-side prepared statements.
    last_exc = None
    conn = None
    for attempt in range(2):
        try:
            conn = psycopg.connect(**conn_params, prepare_threshold=None)
            with conn.cursor() as cur:
                cur.execute("SELECT set_config('request.jwt.claims', %s, true)", (jwt_claims,))
            break
        except (psycopg.OperationalError, psycopg.InterfaceError) as exc:
            last_exc = exc
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
            message = str(exc)
            if attempt == 0 and ("SSL connection has been closed unexpectedly" in message or "DbHandler exited" in message):
                time.sleep(0.25)
                continue
            raise
    if conn is None and last_exc:
        raise last_exc

    try:
        yield conn
    finally:
        conn.close()
