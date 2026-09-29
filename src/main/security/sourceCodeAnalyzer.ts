import fs from 'fs';
import path from 'path';

export interface SourceCodeRisk {
  filePath: string;
  fileName: string;
  lineNumber: number;
  snippet: string;
  patternType: 'SQL String Concatenation' | 'Template Literal Injection' | 'Raw Query Bypass' | 'Unescaped Variable Interpolation';
  severity: 'High' | 'Medium';
  explanation: string;
  secureRewrite: string;
}

export class SourceCodeAnalyzer {
  private static readonly UNSAFE_PATTERNS = [
    {
      type: 'Raw Query Bypass' as const,
      regex: /\b(db\.raw|sequelize\.query|prisma\.\$queryRawUnsafe|knex\.raw)\s*\(\s*[`'"].*?\$\{/i,
      severity: 'High' as const,
      explanation: 'Raw ORM bypass methods executed with unsanitized dynamic string concatenation negate ORM protections.',
      rewrite: 'Use standard ORM models or parameterized methods (e.g. prisma.$queryRaw`...` or knex.raw("... ?", [val])).'
    },
    {
      type: 'Template Literal Injection' as const,
      regex: /(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s+.*?\$\{.*?\}/i,
      severity: 'High' as const,
      explanation: 'Interpolating untrusted variables directly into SQL template literals creates SQL injection vulnerabilities.',
      rewrite: 'Use parameterized query placeholders (?, $1, :name) with parameter array binding.'
    },
    {
      type: 'SQL String Concatenation' as const,
      regex: /(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\s+.*?\+\s*[a-zA-Z0-9_.]+/i,
      severity: 'High' as const,
      explanation: 'String concatenation with "+" merges user input directly into executable SQL syntax.',
      rewrite: 'Pass user parameters as separate bind values or parameterized placeholders (?, $1) to the execution function.'
    }
  ];

  /**
   * Scans a file or directory for unsafe SQL query construction
   */
  public static scanCode(content: string, filePath: string = 'backend/query.js'): SourceCodeRisk[] {
    const risks: SourceCodeRisk[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const pattern of this.UNSAFE_PATTERNS) {
        if (pattern.regex.test(line)) {
          risks.push({
            filePath,
            fileName: path.basename(filePath),
            lineNumber: i + 1,
            snippet: line.trim(),
            patternType: pattern.type,
            severity: pattern.severity,
            explanation: pattern.explanation,
            secureRewrite: pattern.rewrite
          });
          break;
        }
      }
    }

    return risks;
  }

  /**
   * Scans a file on disk if it exists
   */
  public static scanFileOnDisk(targetPath: string): SourceCodeRisk[] {
    try {
      if (!fs.existsSync(targetPath)) return [];
      const content = fs.readFileSync(targetPath, 'utf-8');
      return this.scanCode(content, targetPath);
    } catch {
      return [];
    }
  }
}
