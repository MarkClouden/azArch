"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const github = __importStar(require("@actions/github"));
const core = __importStar(require("@actions/core"));
const xml2js_1 = require("xml2js");
const fs = __importStar(require("fs/promises"));
const glob = __importStar(require("glob"));
// Extract XML of each discovered TRX files, returning as an array of JSON transformed XMLs
function parseTrxFiles(pattern) {
    return __awaiter(this, void 0, void 0, function* () {
        const files = glob.sync(pattern);
        const results = [];
        for (const file of files) {
            const data = yield fs.readFile(file);
            const result = yield (0, xml2js_1.parseStringPromise)(data);
            results.push(result);
        }
        return results;
    });
}
// Extract from each discovered code coverage report
function parseCoverageFiles(pattern) {
    return __awaiter(this, void 0, void 0, function* () {
        const files = glob.sync(pattern);
        const results = [];
        for (const file of files) {
            const data = yield fs.readFile(file);
            const result = yield (0, xml2js_1.parseStringPromise)(data);
            results.push(result);
        }
        return results;
    });
}
// Given TRX content in JSON form extract out the interesting bits
function analyzeResults(results) {
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
function analyzeCoverage(results, excludePackages) {
    let totalLines = 0;
    let coveredLines = 0;
    let totalClasses = 0;
    for (const result of results) {
        const packages = result.coverage.packages[0].package;
        for (const pkg of packages) {
            const pkgName = pkg.$.name;
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
function postResults(results, coverage, token) {
    return __awaiter(this, void 0, void 0, function* () {
        const context = github.context;
        const octokit = github.getOctokit(token);
        const commentBody = `Test Results:\n- Passed: ${results.passed}\n- Failed: ${results.failed}\n- Skipped: ${results.skipped}`;
        if (context.payload.pull_request) {
            const pull_request_number = context.payload.pull_request.number;
            // Post results as a comment to the PR
            yield octokit.rest.issues.createComment(Object.assign(Object.assign({}, context.repo), { issue_number: pull_request_number, body: commentBody }));
            // Create a check run
            yield octokit.rest.checks.create(Object.assign(Object.assign({}, context.repo), { name: "test-results", head_sha: context.sha, status: "completed", conclusion: results.failed > 0 ? "failure" : "success", output: {
                    title: "Test Results",
                    summary: commentBody,
                } }));
        }
        // Set the results as the step output
        core.setOutput("results", JSON.stringify(results));
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        //  const localProjects = glob.sync("**/*.csproj").map(file => path.basename(file, ".csproj").toLowerCase());
        const localProjects = [];
        const trxResults = yield parseTrxFiles("**/*.trx");
        const trxAnalyzed = analyzeResults(trxResults);
        const cvgResults = yield parseCoverageFiles("**/*.cobertura.xml");
        const cvgAnalyzed = analyzeCoverage(cvgResults, localProjects);
        //  const token = core.getInput("github_token");
        //  await postResults(trxAnalyzed, cvgAnalyzed, token);
        console.log(trxAnalyzed);
        console.log(cvgAnalyzed);
    });
}
run().catch((error) => core.setFailed("Workflow failed! " + error.message));
