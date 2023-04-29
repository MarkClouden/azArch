import * as github from "@actions/github";
import * as core from "@actions/core";
import { parseStringPromise } from "xml2js";
import * as fs from "fs/promises";
import * as glob from "glob";
import * as path from "path";

// Extract XML of each discovered TRX files, returning as an array of JSON transformed XMLs
async function parseTrxFiles(pattern: string): Promise<any[]> {
    const files = glob.sync(pattern);
    const results: any[] = [];

    for (const file of files) {
        const data = await fs.readFile(file);
        const result = await parseStringPromise(data);
        results.push(result);
    }

    return results;
}

// Extract from each discovered code coverage report
async function parseCoverageFiles(pattern: string): Promise<any[]> {
    const files = glob.sync(pattern);
    const results: any[] = [];

    for (const file of files) {
        const data = await fs.readFile(file);
        const result = await parseStringPromise(data);
        results.push(result);
    }

    return results;
}

// Given TRX content in JSON form extract out the interesting bits
function analyzeResults(results: any[]): { passed: number; failed: number; skipped: number; } {
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    // For each file
    for (const result of results) {
        //  Examine each test result
        for (const test of result["TestRun"]["Results"][0]["UnitTestResult"]) {
            switch (test.$.outcome) {
                case "Passed":
                    passed++;
                    break;
                case "Failed":
                    failed++;
                    break;
                case "NotExecuted":
                    skipped++;
                    break;
            }
        }
    }

    return { passed, failed, skipped };
}

function analyzeCoverage(results: any[], excludePackages: string[]): { totalClasses: number, totalLines: number, coveredLines: number } {
    let totalLines = 0;
    let coveredLines = 0;
    let totalClasses = 0;

    for (const result of results) {
        const packages = result.coverage.packages[0].package;

        for (const pkg of packages) {
            const pkgName: string = pkg.$.name;

            if (excludePackages.indexOf(pkgName.toLowerCase()) != -1)
                continue;

            const classes = pkg.classes[0].class;

            for (const cls of classes) {
                const clsName = cls.$.name;

                totalClasses++;

                if (!cls.lines || !cls.lines[0] || !cls.lines[0].line) {
                    continue;
                }

                const lines = cls.lines[0].line;

                for (const line of lines) {
                    totalLines++;
                    if (line.$.hits > 0) {
                        coveredLines++;
                    }
                }
            }
        }
    }

    if (totalLines != 0)
        return { totalClasses, totalLines, coveredLines };

    return { totalClasses: 0, totalLines: 0, coveredLines: 0 };
}

// Write summarized results to PR as a comment, to merge check, and to the action output
async function postResults(
    results: { passed: number; failed: number; skipped: number },
    coverage: { totalClasses: number, totalLines: number, coveredLines: number },
    token: string): Promise<void> {
    const context = github.context;
    const octokit = github.getOctokit(token);

    const commentBody = `Test Results:\n- Passed: ${results.passed}\n- Failed: ${results.failed}\n- Skipped: ${results.skipped}\n- Coverage: ${coverage.coveredLines} of ${coverage.totalLines} lines`;

    if (context.payload.pull_request) {
        const pull_request_number = context.payload.pull_request.number;

        // Post results as a comment to the PR
        await octokit.rest.issues.createComment({
            ...context.repo,
            issue_number: pull_request_number,
            body: commentBody,
        });

        // Create a check run
        await octokit.rest.checks.create({
            ...context.repo,
            name: "test-results",
            head_sha: context.sha,
            status: "completed",
            conclusion: results.failed > 0 ? "failure" : "success",
            output: {
                title: "Test Results",
                summary: commentBody,
            },
        });
    }

    // Set the results as the step output
    core.setOutput("results", JSON.stringify(results));
}

async function run() {
    //  const localProjects = glob.sync("**/*.csproj").map(file => path.basename(file, ".csproj").toLowerCase());
    const localProjects: string[] = [];

    const trxResults = await parseTrxFiles("**/*.trx");
    const trxAnalyzed = analyzeResults(trxResults);

    const cvgResults = await parseCoverageFiles("**/*.cobertura.xml");
    const cvgAnalyzed = analyzeCoverage(cvgResults, localProjects);

    //  const token = core.getInput("github_token");

    //  await postResults(trxAnalyzed, cvgAnalyzed, token);

    console.log(trxAnalyzed);
    console.log(cvgAnalyzed);
}

run().catch((error) => core.setFailed("Workflow failed! " + error.message));
