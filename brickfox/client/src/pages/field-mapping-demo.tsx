import { FieldMappingEditor } from '@/components/field-mapping-editor';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function FieldMappingDemo() {
  const handleSave = (mappings: any[]) => {
    console.log('Mappings saved:', mappings);
  };

  return (
    <div className="container max-w-7xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Field Mapping Tool</h1>
        <p className="text-muted-foreground">
          Ordnen Sie gescrapte Felder oder CSV-Spalten den Brickfox-Spalten zu
        </p>
      </div>

      <FieldMappingEditor
        supplierId="test-supplier-id"
        projectId="test-project-id"
        onSave={handleSave}
      />

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Anleitung</CardTitle>
          <CardDescription>So verwenden Sie das Field Mapping Tool</CardDescription>
        </CardHeader>
        <div className="p-6 space-y-4 text-sm">
          <div>
            <strong>1. Datenquelle wählen:</strong>
            <p className="text-muted-foreground">
              Wählen Sie zwischen "URL Scraper" (für gescrapte Produkte) oder "CSV Upload" (für hochgeladene CSV-Dateien).
            </p>
          </div>
          <div>
            <strong>2. Feld auswählen:</strong>
            <p className="text-muted-foreground">
              Klicken Sie auf ein Quellfeld (links), das Sie zuordnen möchten.
            </p>
          </div>
          <div>
            <strong>3. Zielfeld zuordnen:</strong>
            <p className="text-muted-foreground">
              Klicken Sie dann auf das entsprechende Brickfox-Feld (rechts). Die Verbindung wird sofort erstellt.
            </p>
          </div>
          <div>
            <strong>4. Speichern:</strong>
            <p className="text-muted-foreground">
              Klicken Sie auf "Speichern", um die Mappings zu speichern. Diese werden dann automatisch beim Brickfox-Export verwendet.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
