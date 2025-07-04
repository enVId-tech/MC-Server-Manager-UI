import axios, { AxiosInstance, AxiosResponse } from 'axios';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env

interface DnsRecord {
    id: string;
    name: string;
    type: string;
    content: string;
    ttl: string;
    prio: string;
    notes: string;
}

interface DomainInfo {
    domain: string;
    createDate: string;
    expireDate: string;
    renewalDate: string;
    status: string;
    locked: string;
    whoisPrivacy: string;
    transferLock: string;
    autorenew: string;
    // Add more fields as per Porkbun API documentation if needed
}

interface RetrieveDnsResponse {
    status: 'SUCCESS' | 'ERROR';
    records: DnsRecord[];
    message?: string;
}

interface RetrieveDomainInfoResponse {
    status: 'SUCCESS' | 'ERROR';
    domain: DomainInfo;
    message?: string;
}

interface RetrieveAllDomainsResponse {
    status: 'SUCCESS' | 'ERROR';
    domains: DomainInfo[];
    message?: string;
}

interface CreateDnsRecordPayload {
    name: string;
    type: string;
    content: string;
    ttl?: string;
    prio?: string;
}

interface CreateDnsRecordResponse {
    status: 'SUCCESS' | 'ERROR';
    id?: string;
    message?: string;
}

interface DeleteDnsRecordResponse {
    status: 'SUCCESS' | 'ERROR';
    message?: string;
}

interface SrvValidationDetails {
    step: 'connectivity_test' | 'basic_record_test' | 'srv_creation_success' | 'srv_creation_failed' | 'exception';
    testResult?: { success: boolean; error?: string };
    error?: unknown;
}

interface DnsFallbackDetails {
    method: 'srv' | 'cname_fallback' | 'both_failed' | 'exception';
    srvError?: string;
    note?: string;
    srvResult?: { success: boolean; recordId?: string; error?: string; details?: SrvValidationDetails };
    error?: unknown;
}


export class PorkbunService {
    private api: AxiosInstance;
    private apiKey: string;
    private secretKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.PORKBUN_API_KEY || '';
        this.secretKey = process.env.PORKBUN_SECRET_KEY || '';
        this.baseUrl = 'https://api.porkbun.com/api/json/v3'; // Correct Porkbun API base URL

        // Don't throw an error during build time - defer validation until actual usage
        this.api = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000, // 10 seconds timeout
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    private validateCredentials() {
        if (!this.apiKey || !this.secretKey) {
            const error = 'Porkbun API Key and Secret Key must be set in environment variables (PORKBUN_API_KEY, PORKBUN_SECRET_KEY).';
            console.error(error);
            throw new Error(error);
        }

        console.log('Porkbun credentials validated successfully');
    }

    private getAuthPayload() {
        return {
            apikey: this.apiKey,
            secretapikey: this.secretKey,
        };
    }

    /**
     * Fetches all DNS records for a given domain.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @returns An array of DNS records or null if an error occurs.
     */
    public async getDnsRecords(domain: string): Promise<DnsRecord[] | null> {
        this.validateCredentials();
        if (!domain || !domain.includes('.')) {
            console.error(`Error: Invalid domain format provided to getDnsRecords. Expected FQDN like "example.com", got "${domain}"`);
            return null;
        }

        try {
            const response: AxiosResponse<RetrieveDnsResponse> = await this.api.post(
                `/dns/retrieve/${domain}`,
                this.getAuthPayload()
            );

            if (response.data.status === 'SUCCESS') {
                return response.data.records;
            } else {
                console.error(`Porkbun API Error (getDnsRecords for ${domain}): ${response.data.message}`);
                return null;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Error fetching DNS records for ${domain}: Request failed with status code ${error.response?.status}`);
                console.error('Response data:', error.response?.data);
            } else {
                console.error(`An unexpected error occurred while fetching DNS records for ${domain}:`, error);
            }
            return null;
        }
    }

    /**
     * Fetches general information about a specific domain.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @returns DomainInfo object or null if an error occurs.
     */
    public async getDomainInfo(domain: string): Promise<DomainInfo | null> {
        if (!domain || !domain.includes('.')) {
            console.error(`Error: Invalid domain format provided to getDomainInfo. Expected FQDN like "example.com", got "${domain}"`);
            return null;
        }

        try {
            const response: AxiosResponse<RetrieveDomainInfoResponse> = await this.api.post(
                `/domain/retrieve/${domain}`,
                this.getAuthPayload()
            );

            if (response.data.status === 'SUCCESS') {
                return response.data.domain;
            } else {
                console.error(`Porkbun API Error (getDomainInfo for ${domain}): ${response.data.message}`);
                return null;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Error fetching domain info for ${domain}: Request failed with status code ${error.response?.status}`);
                console.error('Response data:', error.response?.data);
            } else {
                console.error(`An unexpected error occurred while fetching domain info for ${domain}:`, error);
            }
            return null;
        }
    }

    /**
     * Fetches information for all domains associated with the API key.
     * @returns An array of DomainInfo objects or null if an error occurs.
     */
    public async getAllDomainsInfo(): Promise<DomainInfo[] | null> {
        try {
            const response: AxiosResponse<RetrieveAllDomainsResponse> = await this.api.post(
                '/domain/retrieveAll',
                this.getAuthPayload()
            );

            if (response.data.status === 'SUCCESS') {
                return response.data.domains;
            } else {
                console.error(`Porkbun API Error (getAllDomainsInfo): ${response.data.message}`);
                return null;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Error fetching all domain info: Request failed with status code ${error.response?.status}`);
                console.error('Response data:', error.response?.data);
            } else {
                console.error('An unexpected error occurred while fetching all domain info:', error);
            }
            return null;
        }
    }

    /**
     * Creates a DNS record for a domain.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @param payload The DNS record data to create.
     * @returns The record ID if successful, or null if an error occurs.
     */
    public async createDnsRecord(domain: string, payload: CreateDnsRecordPayload): Promise<string | null> {
        this.validateCredentials();
        if (!domain || !domain.includes('.')) {
            console.error(`Error: Invalid domain format provided to createDnsRecord. Expected FQDN like "example.com", got "${domain}"`);
            return null;
        }

        try {
            const requestPayload = {
                ...this.getAuthPayload(),
                ...payload
            };

            console.log(`Creating DNS record for ${domain}:`, JSON.stringify(requestPayload, null, 2));

            const response: AxiosResponse<CreateDnsRecordResponse> = await this.api.post(
                `/dns/create/${domain}`,
                requestPayload
            );

            console.log(`DNS API Response for ${domain}:`, JSON.stringify(response.data, null, 2));

            if (response.data.status === 'SUCCESS') {
                console.log(`Successfully created DNS record for ${domain}: ${payload.type} ${payload.name}`);
                return response.data.id || null;
            } else {
                console.error(`Porkbun API Error (createDnsRecord for ${domain}): ${response.data.message}`);
                console.error(`Full response:`, JSON.stringify(response.data, null, 2));
                return null;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Error creating DNS record for ${domain}: Request failed with status code ${error.response?.status}`);
                console.error('Response data:', JSON.stringify(error.response?.data, null, 2));
                console.error('Request payload was:', JSON.stringify({
                    ...this.getAuthPayload(),
                    ...payload
                }, null, 2));
            } else {
                console.error(`An unexpected error occurred while creating DNS record for ${domain}:`, error);
            }
            return null;
        }
    }

    /**
     * Deletes a DNS record by its ID.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @param recordId The ID of the DNS record to delete.
     * @returns True if successful, false if an error occurs.
     */
    public async deleteDnsRecord(domain: string, recordId: string): Promise<boolean> {
        this.validateCredentials();
        if (!domain || !domain.includes('.')) {
            console.error(`Error: Invalid domain format provided to deleteDnsRecord. Expected FQDN like "example.com", got "${domain}"`);
            return false;
        }

        if (!recordId) {
            console.error('Error: Record ID is required for deleteDnsRecord');
            return false;
        }

        try {
            const response: AxiosResponse<DeleteDnsRecordResponse> = await this.api.post(
                `/dns/delete/${domain}/${recordId}`,
                this.getAuthPayload()
            );

            if (response.data.status === 'SUCCESS') {
                console.log(`Successfully deleted DNS record ${recordId} for ${domain}`);
                return true;
            } else {
                console.error(`Porkbun API Error (deleteDnsRecord for ${domain}): ${response.data.message}`);
                return false;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Error deleting DNS record ${recordId} for ${domain}: Request failed with status code ${error.response?.status}`);
                console.error('Response data:', error.response?.data);
            } else {
                console.error(`An unexpected error occurred while deleting DNS record ${recordId} for ${domain}:`, error);
            }
            return false;
        }
    }

    /**
     * Creates an SRV record for a Minecraft server.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @param subdomain The subdomain for the server (e.g., "myserver").
     * @param port The port number the server is running on.
     * @param target The target hostname (usually the server's IP or hostname).
     * @param ttl TTL for the record (default: "300").
     * @returns The record ID if successful, or null if an error occurs.
     */
    public async createMinecraftSrvRecord(
        domain: string,
        subdomain: string,
        port: number,
        target: string,
        ttl: string = '300'
    ): Promise<string | null> {
        this.validateCredentials();

        // Clean up subdomain to ensure it doesn't already contain the domain
        let cleanSubdomain = subdomain;
        if (subdomain.endsWith(`.${domain}`)) {
            cleanSubdomain = subdomain.replace(`.${domain}`, '');
            console.log(`⚠️  Subdomain contained domain suffix. Cleaned: "${subdomain}" -> "${cleanSubdomain}"`);
        }

        // For Porkbun API, the record name should NOT include the domain
        // The API automatically appends the domain to create the full FQDN
        // So for "_minecraft._tcp.main1.etran.dev", we only send "_minecraft._tcp.main1"
        const srvName = `_minecraft._tcp.${cleanSubdomain}`;

        console.log(`Creating SRV record for Minecraft server: ${srvName} -> ${target}:${port}`);
        console.log(`Record name (without domain): ${srvName}`);
        console.log(`Full FQDN will be: ${srvName}.${domain}`);

        // Try different SRV record formats according to RFC 2782
        // The content should be: priority weight port target
        // Where target is the actual server hostname, not the subdomain
        const srvFormats = [
            // Format 1: Standard RFC 2782 format (priority weight port target)
            `0 ${port} ${cleanSubdomain}`,
            // Format 2: Alternative priority/weight values  
            `5 ${port} ${cleanSubdomain}`,
            // Format 3: Different weight value
            `10 ${port} ${cleanSubdomain}`,
        ];

        for (let i = 0; i < srvFormats.length; i++) {
            const srvContent = srvFormats[i];

            const payload: CreateDnsRecordPayload = {
                name: `${srvName}`,
                type: 'SRV',
                content: srvContent,
                ttl: ttl
            };

            console.log(`Attempt ${i + 1}: SRV record payload:`, JSON.stringify(payload, null, 2));
            console.log(`Expected full record: ${srvName} -> ${srvContent}`);

            const result = await this.createDnsRecord(domain, payload);

            if (result) {
                console.log(`Successfully created SRV record with format ${i + 1}: ${srvContent}`);
                console.log(`Full SRV record: ${srvName} IN SRV ${srvContent}`);
                return result;
            }

            console.log(`Format ${i + 1} failed, trying next format...`);

            // Add a small delay between attempts
            if (i < srvFormats.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.error(`All SRV record formats failed for ${srvName}.${domain}`);
        return null;
    }

    /**
     * Finds and deletes SRV records for a Minecraft server by subdomain.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @param subdomain The subdomain for the server (e.g., "myserver").
     * @returns True if at least one record was deleted, false otherwise.
     */
    public async deleteMinecraftSrvRecord(domain: string, subdomain: string): Promise<boolean> {
        this.validateCredentials();
        try {
            // Clean up subdomain to ensure it doesn't already contain the domain
            let cleanSubdomain = subdomain;
            if (subdomain.endsWith(`.${domain}`)) {
                cleanSubdomain = subdomain.replace(`.${domain}`, '');
                console.log(`⚠️  Subdomain contained domain suffix for deletion. Cleaned: "${subdomain}" -> "${cleanSubdomain}"`);
            }

            // First, get all DNS records for the domain
            const records = await this.getDnsRecords(domain);
            if (!records) {
                console.error(`Failed to retrieve DNS records for ${domain}`);
                return false;
            }

            // Find SRV records for the Minecraft server
            const srvName = `_minecraft._tcp.${cleanSubdomain}`;
            const srvRecords = records.filter(record =>
                record.type === 'SRV' && record.name === srvName
            );

            if (srvRecords.length === 0) {
                console.log(`No SRV records found for ${srvName}.${domain}`);
                return false;
            }

            // Delete all matching SRV records
            let deletedCount = 0;
            for (const record of srvRecords) {
                const success = await this.deleteDnsRecord(domain, record.id);
                if (success) {
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`Successfully deleted ${deletedCount} SRV record(s) for ${srvName}.${domain}`);
                return true;
            } else {
                console.error(`Failed to delete SRV records for ${srvName}.${domain}`);
                return false;
            }
        } catch (error) {
            console.error(`Error deleting Minecraft SRV record for ${subdomain}.${domain}:`, error);
            return false;
        }
    }

    /**
     * Test DNS connectivity by attempting to retrieve domain records
     * @param domain The domain to test
     * @returns True if connectivity is working, false otherwise
     */
    public async testDnsConnectivity(domain: string): Promise<boolean> {
        try {
            console.log(`Testing DNS connectivity for domain: ${domain}`);
            const records = await this.getDnsRecords(domain);
            const isConnected = records !== null;
            console.log(`DNS connectivity test result: ${isConnected ? 'SUCCESS' : 'FAILED'}`);
            return isConnected;
        } catch (error) {
            console.error('DNS connectivity test failed:', error);
            return false;
        }
    }

    /**
     * Creates an SRV record for a Minecraft server with improved error handling and validation.
     * This method will first test connectivity and then try multiple SRV record formats.
     */
    public async createMinecraftSrvRecordWithValidation(
        domain: string,
        subdomain: string,
        port: number,
        target: string,
        ttl: string = '300'
    ): Promise<{ success: boolean; recordId?: string; error?: string; details?: SrvValidationDetails }> {
        try {
            this.validateCredentials();

            console.log(`=== Creating Minecraft SRV Record ===`);
            console.log(`Domain: ${domain}`);
            console.log(`Subdomain: ${subdomain}`);
            console.log(`Target: ${target}`);
            console.log(`Port: ${port}`);
            console.log(`TTL: ${ttl}`);

            // Step 1: Test DNS connectivity by reading existing records
            console.log(`Step 1: Testing DNS connectivity...`);
            const isConnected = await this.testDnsConnectivity(domain);
            if (!isConnected) {
                return {
                    success: false,
                    error: 'DNS connectivity test failed. Please check domain and API credentials.',
                    details: { step: 'connectivity_test' }
                };
            }

            // Step 2: Test basic record creation with a simple A record
            console.log(`Step 2: Testing basic record creation...`);
            const testResult = await this.testCreateSimpleRecord(domain);
            if (!testResult.success) {
                return {
                    success: false,
                    error: `Basic record creation test failed: ${testResult.error}`,
                    details: { step: 'basic_record_test', testResult }
                };
            }
            console.log(`Basic record creation test passed!`);

            // Step 3: Try to create the SRV record
            console.log(`Step 3: Creating SRV record...`);
            const recordId = await this.createMinecraftSrvRecord(domain, subdomain, port, target, ttl);

            if (recordId) {
                return {
                    success: true,
                    recordId,
                    details: { step: 'srv_creation_success' }
                };
            } else {
                return {
                    success: false,
                    error: 'SRV record creation failed after all attempts. The domain and API work, but SRV format may not be supported.',
                    details: { step: 'srv_creation_failed' }
                };
            }

        } catch (error) {
            console.error('Error in createMinecraftSrvRecordWithValidation:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                details: { step: 'exception', error: error }
            };
        }
    }

    /**
     * Test creating a simple A record to verify API functionality
     * @param domain The domain to test with
     * @param testSubdomain A test subdomain to use
     * @param testIp A test IP address to use
     * @returns True if the test record was created successfully
     */
    public async testCreateSimpleRecord(
        domain: string,
        testSubdomain: string = 'test-api-' + Date.now(),
        testIp: string = '1.2.3.4'
    ): Promise<{ success: boolean; recordId?: string; error?: string }> {
        try {
            console.log(`Testing simple A record creation: ${testSubdomain}.${domain} -> ${testIp}`);

            const payload: CreateDnsRecordPayload = {
                name: testSubdomain,
                type: 'A',
                content: testIp,
                ttl: '300'
            };

            const recordId = await this.createDnsRecord(domain, payload);

            if (recordId) {
                console.log(`Test A record created successfully with ID: ${recordId}`);

                // Clean up the test record
                setTimeout(async () => {
                    try {
                        await this.deleteDnsRecord(domain, recordId);
                        console.log(`Cleaned up test record: ${recordId}`);
                    } catch (error) {
                        console.warn(`Failed to clean up test record:`, error);
                    }
                }, 5000);

                return { success: true, recordId };
            } else {
                return { success: false, error: 'Failed to create test A record' };
            }
        } catch (error) {
            console.error('Test record creation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Creates a CNAME record as an alternative to SRV for Minecraft servers
     * This can be used when SRV records are not supported or failing
     * @param domain The domain to create the record for
     * @param subdomain The subdomain for the server
     * @param target The target hostname
     * @param ttl TTL for the record
     * @returns The record ID if successful, or null if an error occurs
     */
    public async createMinecraftCnameRecord(
        domain: string,
        subdomain: string,
        target: string,
        ttl: string = '300'
    ): Promise<string | null> {
        this.validateCredentials();

        console.log(`Creating CNAME record as SRV alternative: ${subdomain}.${domain} -> ${target}`);

        const payload: CreateDnsRecordPayload = {
            name: subdomain,
            type: 'CNAME',
            content: target,
            ttl: ttl
        };

        console.log(`CNAME record payload:`, JSON.stringify(payload, null, 2));

        const result = await this.createDnsRecord(domain, payload);

        if (result) {
            console.log(`Successfully created CNAME record: ${subdomain}.${domain} -> ${target}`);
            console.log(`Note: Players will need to connect on the default port (25565) or specify the port manually`);
        }

        return result;
    }

    /**
     * Creates Minecraft DNS records with fallback options
     * Tries SRV first, then falls back to CNAME if SRV fails
     */
    public async createMinecraftDnsWithFallback(
        domain: string,
        subdomain: string,
        port: number,
        target: string,
        ttl: string = '300'
    ): Promise<{
        success: boolean;
        recordId?: string;
        recordType?: 'SRV' | 'CNAME';
        error?: string;
        details?: DnsFallbackDetails
    }> {
        try {
            console.log(`=== Creating Minecraft DNS with Fallback ===`);

            // Try SRV record first
            console.log(`Attempting SRV record creation...`);
            const srvResult = await this.createMinecraftSrvRecordWithValidation(domain, subdomain, port, target, ttl);

            if (srvResult.success) {
                return {
                    success: true,
                    recordId: srvResult.recordId,
                    recordType: 'SRV',
                    details: { method: 'srv', ...srvResult.details }
                };
            }

            console.log(`SRV record failed, attempting CNAME fallback...`);
            console.log(`SRV error was: ${srvResult.error}`);

            // Fallback to CNAME record
            const cnameRecordId = await this.createMinecraftCnameRecord(domain, subdomain, target, ttl);

            if (cnameRecordId) {
                return {
                    success: true,
                    recordId: cnameRecordId,
                    recordType: 'CNAME',
                    details: {
                        method: 'cname_fallback',
                        srvError: srvResult.error,
                        note: `Created CNAME instead of SRV. Players must connect on port ${port} manually.`
                    }
                };
            }

            return {
                success: false,
                error: `Both SRV and CNAME record creation failed. SRV error: ${srvResult.error}`,
                details: { method: 'both_failed', srvResult }
            };

        } catch (error) {
            console.error('Error in createMinecraftDnsWithFallback:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
                details: { method: 'exception', error }
            };
        }
    }

    /**
     * Creates a Minecraft SRV record with strict requirement - no fallback to CNAME.
     * This ensures that only proper SRV records are created, providing the best user experience.
     * If SRV record creation fails, the entire operation fails.
     * 
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @param subdomain The subdomain for the Minecraft server (e.g., "survival").
     * @param port The port number for the Minecraft server.
     * @param target The target hostname (usually the server's IP or hostname).
     * @param ttl TTL for the record (default: "300").
     * @returns The record ID if successful, throws an error if SRV creation fails.
     */
    public async createMinecraftSrvRecordStrict(
        domain: string,
        subdomain: string,
        port: number,
        target: string,
        ttl: string = '300'
    ): Promise<string> {
        this.validateCredentials();

        // Clean up subdomain to ensure it doesn't already contain the domain
        let cleanSubdomain = subdomain;
        if (subdomain.endsWith(`.${domain}`)) {
            cleanSubdomain = subdomain.replace(`.${domain}`, '');
            console.log(`⚠️  Subdomain contained domain suffix. Cleaned: "${subdomain}" -> "${cleanSubdomain}"`);
        }

        console.log(`=== Creating Minecraft SRV Record (Strict Mode) ===`);
        console.log(`Attempting to create SRV record for: _minecraft._tcp.${cleanSubdomain}.${domain}`);
        console.log(`Target: ${target}:${port}`);
        console.log(`Note: This method requires SRV record support - no fallback options`);

        const recordId = await this.createMinecraftSrvRecord(domain, cleanSubdomain, port, target, ttl);

        if (!recordId) {
            const errorMessage = `Failed to create SRV record for _minecraft._tcp.${cleanSubdomain}.${domain}. ` +
                `SRV records are required for proper Minecraft server functionality. ` +
                `Please ensure your DNS provider supports SRV records and your API credentials have the necessary permissions.`;
            throw new Error(errorMessage);
        }

        console.log(`✅ SRV record created successfully in strict mode`);
        console.log(`   Record ID: ${recordId}`);
        console.log(`   Players can connect to: ${cleanSubdomain}.${domain} (port automatically detected)`);

        return recordId;
    }
}

const porkbun = new PorkbunService();

export default porkbun;