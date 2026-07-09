import {
  getPendingAnalysisJobs,
  updateAnalysisJob,
  getDocument,
  updateDocument,
  addActionItem,
} from '../db/document-store.ts';
import { analyzeDocument, improveText } from '../ai/analyzer.ts';
import type { AnalysisResult } from '../ai/types.ts';
import { db } from '../db/schema.ts';
import { v4 as uuid } from 'uuid';
import { getSettings } from '../db/config-store.ts';
import { getStorageProvider } from './storage/registry.ts';

function dateFromResult(r: AnalysisResult): string {
  if (r.dateFrom) return r.dateFrom.slice(0, 10);
  if (r.year && r.month) {
    const m = String(r.month).padStart(2, '0');
    return `${r.year}-${m}-01`;
  }
  if (r.year) return `${r.year}-01-01`;
  return '';
}

export type QueueCallback = (progress: {
  docId: string;
  status: 'analyzing' | 'analyzed' | 'error';
  error?: string;
  done: number;
  total: number;
}) => void;

export async function processQueue(
  docIds?: string[],
  onProgress?: QueueCallback,
): Promise<void> {
  let jobs = await getPendingAnalysisJobs();
  if (docIds) {
    jobs = jobs.filter(j => docIds.includes(j.documentId));
  }
  const total = jobs.length;
  let done = 0;

  for (const job of jobs) {
    const doc = await getDocument(job.documentId);
    if (!doc || doc.status === 'analyzed') {
      await updateAnalysisJob(job.id, { status: 'completed', completedAt: new Date().toISOString() });
      done++;
      continue;
    }

    await updateAnalysisJob(job.id, { status: 'running', startedAt: new Date().toISOString() });
    await updateDocument(doc.id, { status: 'analyzing' });
    onProgress?.({ docId: doc.id, status: 'analyzing', done, total });

    try {
      let text = doc.extractedText || '[No extractable text]';
      if (text && text !== '[No extractable text]') {
        try {
          const improved = await improveText(text);
          if (improved) {
            text = improved;
            await updateDocument(doc.id, { extractedText: text });
          }
        } catch {
          // keep original text
        }
      }

      const settings = await getSettings();
      const allCategories = await db.categories.toArray();
      const validCategoryNames = allCategories.map(c => c.name);
      const result = await analyzeDocument(text, {
        prompt: settings.analysisPrompt,
        validCategories: validCategoryNames,
      });

      const category = validCategoryNames.includes(result.category) ? result.category : 'Misc';

      await updateDocument(doc.id, {
        summary: result.summary,
        audience: result.audience,
        urgency: result.urgency,
        taxRelevant: result.taxRelevant,
        category,
        year: result.year,
        month: result.month,
        suggestedFilename: result.suggestedFilename,
        dateFrom: result.dateFrom,
        dateTo: result.dateTo,
        tags: result.tags,
        confidence: 0.8,
        status: 'analyzed',
        error: null,
      });

      for (const itemText of result.actionItems) {
        const now = new Date().toISOString();
        await addActionItem({
          id: uuid(),
          documentId: doc.id,
          text: itemText,
          urgency: result.urgency,
          completed: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          dueDate: null,
        });
      }

      await updateAnalysisJob(job.id, {
        status: 'completed',
        provider: settings.aiProvider.type,
        model: settings.aiProvider.model,
        completedAt: new Date().toISOString(),
      });

      if (result.suggestedFilename && !doc.storedPath) {
        try {
          const provider = await getStorageProvider();
          if (await provider.isReady()) {
            const datePrefix = dateFromResult(result);
            const datedFilename = datePrefix
              ? `${datePrefix}-${result.suggestedFilename}`
              : result.suggestedFilename;

            const sourceFile = await provider.getFile(doc.originalPath);
            const storedPath = await provider.organizeFile(
              sourceFile,
              result.year,
              category,
              datedFilename,
            );

            try {
              await provider.deleteFile(doc.originalPath);
            } catch {
              // original file may not exist anymore
            }

            await updateDocument(doc.id, { storedPath });
          }
        } catch {
          // file organization failed silently — doc is still analyzed
        }
      }

      done++;
      onProgress?.({ docId: doc.id, status: 'analyzed', done, total });
    } catch (err: any) {
      await updateDocument(doc.id, { status: 'error', error: err.message });
      await updateAnalysisJob(job.id, {
        status: 'failed',
        error: err.message,
        completedAt: new Date().toISOString(),
      });
      done++;
      onProgress?.({ docId: doc.id, status: 'error', error: err.message, done, total });
    }
  }
}
