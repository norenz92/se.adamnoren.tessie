# Tessie

Adds support for Tesla via Tessie

## API Rate Limiting

This integration implements rate limiting protection to prevent issues with Tesla/Tessie API limits:

### Set Charging Current

The "Set Charging Current" feature includes automatic throttling and retry logic:

- **Minimum 5 seconds** between consecutive calls to the same vehicle
- **Automatic retry** with exponential backoff (up to 3 retries)
- **Smart queuing** to prevent rapid successive changes from overwhelming the API

This ensures reliable operation and prevents API rate limit errors that could result in temporary access suspension.

### Best Practices

- Avoid changing charging amps repeatedly in a short time period
- The system will automatically queue and throttle requests to comply with API limits
- If a request fails after retries, wait a few minutes before trying again