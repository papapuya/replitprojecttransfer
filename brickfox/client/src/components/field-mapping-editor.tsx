import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, ArrowRight, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { brickfoxFields } from '@shared/mapping-schema';

interface DetectedField {
  key: string;
  label: string;
  type: string;
  sampleValue?: any;
  count: number;
}

interface FieldMapping {
  id?: string;
  sourceField: string;
  targetField: string;
  transformation?: any;
  isActive?: boolean;
}

interface FieldMappingEditorProps {
  supplierId?: string;
  projectId?: string;
  sourceType?: 'url_scraper' | 'csv';
  onSave?: (mappings: FieldMapping[]) => void;
}

export function FieldMappingEditor({ supplierId, projectId, sourceType: initialSourceType, onSave }: FieldMappingEditorProps) {
  const [sourceType, setSourceType] = useState<'url_scraper' | 'csv'>(initialSourceType || 'url_scraper');
  const [sourceFields, setSourceFields] = useState<DetectedField[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [selectedSourceField, setSelectedSourceField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDetectedFields();
    loadExistingMappings();
  }, [sourceType, supplierId, projectId]);

  const loadDetectedFields = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        source_type: sourceType,
        ...(sourceType === 'url_scraper' ? { supplier_id: supplierId } : {}),
        ...(sourceType === 'csv' && projectId ? { project_id: projectId } : {}),
      });

      const response = await fetch(`/api/fields/detect?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSourceFields(data.fields || []);
      }
    } catch (error) {
      console.error('Failed to load detected fields:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExistingMappings = async () => {
    // Skip loading if supplier ID is not provided for URL scraper
    if (sourceType === 'url_scraper' && !supplierId) {
      console.warn('[Field Mapping] No supplier ID provided, skipping mapping load');
      return;
    }

    // Skip loading if project ID is not provided for CSV
    if (sourceType === 'csv' && !projectId) {
      console.warn('[Field Mapping] No project ID provided, skipping mapping load');
      return;
    }

    try {
      const params = new URLSearchParams({ source_type: sourceType });
      
      // Use different endpoint based on source type
      const url = sourceType === 'url_scraper' && supplierId
        ? `/api/suppliers/${supplierId}/mappings?${params}`
        : sourceType === 'csv' && projectId
        ? `/api/projects/${projectId}/mappings?${params}`
        : null;

      if (!url) {
        console.warn('[Field Mapping] No valid endpoint for loading mappings');
        return;
      }

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMappings(data.mappings || []);
      }
    } catch (error) {
      console.error('Failed to load existing mappings:', error);
    }
  };

  const handleSourceFieldClick = (fieldKey: string) => {
    if (selectedSourceField === fieldKey) {
      setSelectedSourceField(null);
    } else {
      setSelectedSourceField(fieldKey);
    }
  };

  const handleTargetFieldClick = (targetField: string) => {
    if (!selectedSourceField) return;

    const existingMappingIndex = mappings.findIndex(
      m => m.sourceField === selectedSourceField
    );

    if (existingMappingIndex >= 0) {
      const updatedMappings = [...mappings];
      updatedMappings[existingMappingIndex] = {
        ...updatedMappings[existingMappingIndex],
        targetField,
      };
      setMappings(updatedMappings);
    } else {
      setMappings([
        ...mappings,
        {
          sourceField: selectedSourceField,
          targetField,
        },
      ]);
    }

    setSelectedSourceField(null);
  };

  const handleRemoveMapping = (sourceField: string) => {
    setMappings(mappings.filter(m => m.sourceField !== sourceField));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const existingMappingIds = mappings.filter((m: FieldMapping) => m.id).map((m: FieldMapping) => m.id);
      const currentMappings = await loadExistingMappingsData();
      const deletedIds = currentMappings
        .filter((m: FieldMapping) => !existingMappingIds.includes(m.id))
        .map((m: FieldMapping) => m.id);

      for (const id of deletedIds) {
        if (id) {
          await fetch(`/api/mappings/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
            },
          });
        }
      }

      for (const mapping of mappings) {
        if (mapping.id) {
          await fetch(`/api/mappings/${mapping.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
            },
            body: JSON.stringify({
              sourceField: mapping.sourceField,
              targetField: mapping.targetField,
              transformation: mapping.transformation || null,
            }),
          });
        } else {
          await fetch(`/api/suppliers/${supplierId}/mappings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
            },
            body: JSON.stringify({
              sourceType,
              sourceField: mapping.sourceField,
              targetField: mapping.targetField,
              transformation: mapping.transformation || null,
            }),
          });
        }
      }

      onSave?.(mappings);
      await loadExistingMappings();
    } catch (error) {
      console.error('Failed to save mappings:', error);
    } finally {
      setSaving(false);
    }
  };

  const loadExistingMappingsData = async () => {
    try {
      const params = new URLSearchParams({ source_type: sourceType });
      const response = await fetch(`/api/suppliers/${supplierId}/mappings?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase_token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        return data.mappings || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to load existing mappings:', error);
      return [];
    }
  };

  const getMappedTargetField = (sourceField: string) => {
    return mappings.find(m => m.sourceField === sourceField)?.targetField;
  };

  const isTargetFieldMapped = (targetField: string) => {
    return mappings.some(m => m.targetField === targetField);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Field Mapping</CardTitle>
        <CardDescription>
          Ordnen Sie Datenquellen den Brickfox CSV-Spalten zu
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Anleitung */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <span className="text-lg">ℹ️</span>
            So funktioniert die Zuordnung:
          </h4>
          <ol className="text-sm text-blue-800 space-y-1 ml-6 list-decimal">
            <li><strong>Schritt 1:</strong> Klicken Sie auf ein Quellenfeld links (z.B. "EAN Barcode")</li>
            <li><strong>Schritt 2:</strong> Klicken Sie dann auf das passende Brickfox-Feld rechts (z.B. "EAN")</li>
            <li><strong>Schritt 3:</strong> Die Felder werden automatisch verknüpft (✓ grünes Häkchen)</li>
            <li><strong>Fertig:</strong> Klicken Sie auf "Speichern" um die Zuordnung zu sichern</li>
          </ol>
          <p className="text-xs text-blue-700 mt-2 italic">
            💡 Tipp: Bereits zugeordnete Felder sind mit einem grünen Häkchen markiert
          </p>
        </div>

        <div>
          <Label>Datenquelle wählen</Label>
          <RadioGroup
            value={sourceType}
            onValueChange={(value) => setSourceType(value as 'url_scraper' | 'csv')}
            className="flex gap-4 mt-2"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="url_scraper" id="url_scraper" />
              <Label htmlFor="url_scraper" className="cursor-pointer">URL Scraper</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="csv" id="csv" />
              <Label htmlFor="csv" className="cursor-pointer">CSV Upload</Label>
            </div>
          </RadioGroup>
        </div>

        <Separator />

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  ① Quellenfelder ({sourceType === 'url_scraper' ? 'Scraper' : 'CSV'})
                </h3>
                {selectedSourceField && (
                  <Badge variant="default" className="bg-blue-600">
                    Ausgewählt ✓
                  </Badge>
                )}
              </div>
              <ScrollArea className="h-[400px] rounded-md border p-3">
                <div className="space-y-2">
                  {sourceFields.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Keine Felder erkannt. Bitte scrapen Sie zuerst Produkte oder laden Sie eine CSV hoch.
                    </p>
                  )}
                  {sourceFields.map((field) => {
                    const mappedTarget = getMappedTargetField(field.key);
                    const isSelected = selectedSourceField === field.key;

                    return (
                      <Button
                        key={field.key}
                        variant={isSelected ? 'default' : mappedTarget ? 'secondary' : 'outline'}
                        className="w-full justify-start text-left h-auto py-3 px-3"
                        onClick={() => handleSourceFieldClick(field.key)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {mappedTarget && <Check className="h-4 w-4 text-green-600 flex-shrink-0" />}
                            <span className="font-semibold truncate">{field.label}</span>
                            <Badge variant="outline" className="text-xs ml-auto">
                              {field.type}
                            </Badge>
                          </div>
                          {field.sampleValue && (
                            <div className="bg-gray-100 rounded px-2 py-1 mt-1">
                              <span className="text-sm font-medium text-gray-800 break-words">
                                {String(field.sampleValue).slice(0, 50)}{String(field.sampleValue).length > 50 ? '...' : ''}
                              </span>
                            </div>
                          )}
                          {mappedTarget && (
                            <div className="flex items-center gap-1 mt-2">
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">{mappedTarget}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0 ml-auto"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveMapping(field.key);
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">
                  ② Brickfox CSV Felder
                </h3>
                {selectedSourceField && (
                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                    Wählen Sie ein Ziel →
                  </Badge>
                )}
              </div>
              <ScrollArea className="h-[400px] rounded-md border p-3">
                <div className="space-y-2">
                  {brickfoxFields.map((field: typeof brickfoxFields[number]) => {
                    const isMapped = isTargetFieldMapped(field.key);

                    return (
                      <Button
                        key={field.key}
                        variant={isMapped ? 'secondary' : 'outline'}
                        className="w-full justify-start text-left h-auto py-3 px-3"
                        onClick={() => handleTargetFieldClick(field.key)}
                        disabled={!selectedSourceField}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {isMapped && <Check className="h-4 w-4 text-green-600 flex-shrink-0" />}
                            <span className="font-semibold truncate">{field.label}</span>
                            {field.required && (
                              <Badge variant="destructive" className="text-xs ml-auto">
                                Pflicht
                              </Badge>
                            )}
                          </div>
                          {field.category && (
                            <Badge variant="outline" className="text-xs mb-1 bg-blue-50 text-blue-700 border-blue-200">
                              {field.category}
                            </Badge>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {field.type}
                          </div>
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {mappings.length} {mappings.length === 1 ? 'Mapping' : 'Mappings'} erstellt
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setMappings([])}
              disabled={mappings.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Alle löschen
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || mappings.length === 0}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Speichern
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
