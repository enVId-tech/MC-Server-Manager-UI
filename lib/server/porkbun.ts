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


export class PorkbunService {
    private api: AxiosInstance;
    private apiKey: string;
    private secretKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.PORKBUN_API_KEY || '';
        this.secretKey = process.env.PORKBUN_SECRET_KEY || '';
        this.baseUrl = 'https://api.porkbun.com/api/json/v3'; // Correct Porkbun API base URL

        if (!this.apiKey || !this.secretKey) {
            throw new Error('Porkbun API Key and Secret Key must be set in environment variables (PORKBUN_API_KEY, PORKBUN_SECRET_KEY).');
        }

        this.api = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000, // 10 seconds timeout
            headers: {
                'Content-Type': 'application/json',
            },
        });
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
        if (!domain || !domain.includes('.')) {
            console.error(`Error: Invalid domain format provided to createDnsRecord. Expected FQDN like "example.com", got "${domain}"`);
            return null;
        }

        try {
            const requestPayload = {
                ...this.getAuthPayload(),
                ...payload
            };

            const response: AxiosResponse<CreateDnsRecordResponse> = await this.api.post(
                `/dns/create/${domain}`,
                requestPayload
            );

            if (response.data.status === 'SUCCESS') {
                console.log(`Successfully created DNS record for ${domain}: ${payload.type} ${payload.name}`);
                return response.data.id || null;
            } else {
                console.error(`Porkbun API Error (createDnsRecord for ${domain}): ${response.data.message}`);
                return null;
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`Error creating DNS record for ${domain}: Request failed with status code ${error.response?.status}`);
                console.error('Response data:', error.response?.data);
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
        const srvName = `_minecraft._tcp.${subdomain}`;
        const srvContent = `0 5 ${port} ${target}`;

        const payload: CreateDnsRecordPayload = {
            name: srvName,
            type: 'SRV',
            content: srvContent,
            ttl: ttl
        };

        console.log(`Creating SRV record for Minecraft server: ${srvName}.${domain} -> ${target}:${port}`);
        return await this.createDnsRecord(domain, payload);
    }

    /**
     * Finds and deletes SRV records for a Minecraft server by subdomain.
     * @param domain The fully qualified domain name (e.g., "example.com").
     * @param subdomain The subdomain for the server (e.g., "myserver").
     * @returns True if at least one record was deleted, false otherwise.
     */
    public async deleteMinecraftSrvRecord(domain: string, subdomain: string): Promise<boolean> {
        try {
            // First, get all DNS records for the domain
            const records = await this.getDnsRecords(domain);
            if (!records) {
                console.error(`Failed to retrieve DNS records for ${domain}`);
                return false;
            }

            // Find SRV records for the Minecraft server
            const srvName = `_minecraft._tcp.${subdomain}`;
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
}

const porkbun = new PorkbunService();

export default porkbun;