import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TagRef } from '@app/shared';
import { Combobox } from '@/components/combobox';
import { SideSection } from '@/components/side-section';
import { peopleApi, tagsQuery, useWrite } from '@/lib/data';

export function TagsSection({ personId, tags }: { personId: string; tags: TagRef[] }) {
  const { t } = useTranslation();
  const { data: allTags = [] } = useQuery(tagsQuery);
  const add = useWrite((name: string) => peopleApi.addTag(personId, name));
  const remove = useWrite((tagId: string) => peopleApi.removeTag(personId, tagId));

  return (
    <SideSection title={t('tags.title')}>
      <ul className="flex flex-wrap gap-1.5 py-2" aria-label={t('tags.title')}>
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="flex items-center gap-1 rounded-sm border px-2 py-0.5 text-sm"
          >
            #{tag.name}
            <button
              type="button"
              onClick={() => remove.mutate(tag.id)}
              aria-label={t('tags.removeNamed', { name: tag.name })}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Combobox
        label={t('tags.add')}
        placeholder={t('tags.add')}
        options={allTags
          .filter((tag) => !tags.some((own) => own.id === tag.id))
          .map((tag) => ({ value: tag.id, label: `#${tag.name}` }))}
        onSelect={(option) => add.mutate(option.label.replace(/^#/, ''))}
        onCreate={(query) => add.mutate(query)}
        createLabel={(query) => t('tags.create', { name: query.replace(/^#/, '') })}
      />
    </SideSection>
  );
}
