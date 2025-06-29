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
}

const porkbun = new PorkbunService();

export default porkbun;