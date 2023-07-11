import nodeFetch from "node-fetch";
import fetchCookie from "fetch-cookie";
import path from "path"
import fs from "fs";

const fetch = fetchCookie(nodeFetch);

class Crawler {
    constructor() {
        this.queue = [];

        this.headers = {
            'Pragma': 'no-catch',
            'User-Agent':'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
            'Host': 'kenyalaw.org',
            'Content-Type': 'text/html'
        };

        this.allowedPatterns = [
            /^http:\/\/kenyalaw\.org\/caselaw\/cases\/\d+/,
            /^http:\/\/kenyalaw\.org\/caselaw\/cases\/advanced_search_courts/,
        ];
    }
    
    seedGenerator() {
        this.queue.push("http://kenyalaw.org/caselaw/cases/advanced_search_courts?courtId=23");
    }
    
    async makeRequest({ requestURL, requestOptions }) {
        const response = await fetch(requestURL, requestOptions);
        const contentType = response.headers.get("content-type")
        const content = await response.text();

        
        return {
            requestURL,
            response,
            requestOptions,
            content,
            contentType
        };
    }

    
    async fetchURL({ requestURL, headers }) {
        const requestOptions = {
            headers: {
                ...this.headers,
                ...headers
            }
        };
        
        const response = await this.makeRequest({ requestURL, requestOptions });
        
        this.discoverLinks(response);

        return [response];
    }

    discoverLinks({ content, requestURL, contentType }) {
        if (contentType !== "text/html") return;

        const hrefRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g;

        let match;

        while ((match = hrefRegex.exec(content)) !== null) {
            const href = match[2];
            
            if (href && this.isAllowedURL(href)) {
                this.queue.push(href);
            }
        }
    }

    isAllowedURL(url){
        return this.allowedPatterns.some((pattern) => pattern.test(url));
    }

    async crawlerRunner() {
        this.seedGenerator();

        let fetchedCount = 0;
        let failedCount = 0;
        let htmlCount = 0;

        while (this.queue.length > 0) {
            const url = this.queue.shift();

            try {
                const response = await this.fetchURL({requestURL: url });
                fetchedCount++;

                if (response.contentType === "text/html") {
                    htmlCount++;

                    const pageNumber = htmlCount;
                    const fileName = `${pageNumber}.html`;
                    const directoryPath = path.join(__dirname, "./results");

                    if (!fs.existsSync(directoryPath)) {
                        fs.mkdirSync(directoryPath, { recursive: true });

                        const filePath = path.join(directoryPath, fileName);

                        fs.writeFileSync(filePath, response.content, "utf8");
                        console.log(`saved html ${fileName}`);
                    }


                    /* fetch individual case pages */
                    if (url.includes("advanced_search_courts")) {
                        const CaseURLs = this.extractCaseURLs(response.content);

                        for (const CaseURL of CaseURLs) {
                            const caseResponse = await this.fetchURL({ requestURL: CaseURL });
                            fetchedCount++

                            if (caseResponse.contentType === "text/html") {
                                htmlCount++

                                const caseData = this.extractCaseData(caseResponse.content);
                                const caseFileName = `case-${caseData.caseNumber}-${caseData.year}.html`;
                                const directoryPath = path.join(__dirname, 'results',)

                                if (!fs.existsSync(directoryPath)) {
                                    fs.mkdirSync(directoryPath, { recursive: true });

                                    const caseFilePath = path.join(directoryPath, caseFileName);

                                    fs.writeFileSync(caseFilePath, caseResponse.content, "utf8")
                                    console.log(`Saved Case: ${caseFileName}`);
                                }
                            }
                        }
                    }
                }

            } catch (error) {
                console.error(`Failed to fetch URL: ${url}`);
                failedCount++;
            }
        }

        console.log(`\nStats:`);
        console.log(`Fetched URLs: ${fetchedCount}`);
        console.log(`Failed URLs: ${failedCount}`);
        console.log(`HTML Content-Type URLs: ${htmlCount}`);
    }

    extractCaseURLs(content) {
        const caseURLs = [];
        const caseURLRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g;

        let match;
        while ((match = caseURLRegex.exec(content)) !== null) {
            const href = match[2];
            if (href) {
                caseURLs.push(href);
            }
        }

        return caseURLs
    }

    extractCaseData(content) {
        const caseNumberRegex = /<h1[^>]*>(.*?)<\/h1>/i;
        const yearRegex = /(\d{4})$/;

        const match = content.match(caseNumberRegex);
        if (match && match[1]) {
            const caseNumber = match[1].trim();
            const yearMatch = caseNumber.match(yearRegex);
            const year = yearMatch ? yearMatch[1] : 'unknown';
            return { caseNumber, year };
        }

        return { caseNumber: '', year: 'unknown' };
    }
}

const crawler = new Crawler();
crawler.crawlerRunner();

