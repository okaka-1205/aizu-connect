import { legalDocuments } from "../content/legalDocuments";
import type { LegalDocument } from "../content/legalMetadata";

export default function LegalDocumentBody({
  document,
}: {
  document: LegalDocument;
}) {
  const content = legalDocuments[document];

  return (
    <>
      <div className="legal-document-intro">
        <p>{content.introduction}</p>
        <dl>
          <div>
            <dt>制定・適用日</dt>
            <dd>{content.effectiveDate}</dd>
          </div>
          <div>
            <dt>版</dt>
            <dd>{content.version}</dd>
          </div>
          {content.meta.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>
                {item.href ? <a href={item.href}>{item.value}</a> : item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {content.sections.map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.bullets && (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {document === "terms" && (
        <p>
          <a href="/open-source-notices.txt" target="_blank" rel="noreferrer">
            オープンソースソフトウェアのライセンス表示
          </a>
        </p>
      )}
    </>
  );
}
