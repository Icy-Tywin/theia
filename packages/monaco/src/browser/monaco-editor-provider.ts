/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import URI from "@theia/core/lib/common/uri";
import { DisposableCollection } from '@theia/core/lib/common';
import { EditorPreferences } from "@theia/editor/lib/browser";
import { PreferenceChangedEvent } from "@theia/preferences/lib/common";
import { MonacoEditor } from "./monaco-editor";
import { MonacoEditorModel } from './monaco-editor-model';
import { MonacoEditorService } from "./monaco-editor-service";
import { MonacoModelResolver } from "./monaco-model-resolver";
import { MonacoContextMenuService } from "./monaco-context-menu";
import { MonacoWorkspace } from "./monaco-workspace";
import { MonacoCommandServiceFactory } from "./monaco-command-service";

@injectable()
export class MonacoEditorProvider {

    toDispose = new DisposableCollection();

    constructor(
        @inject(MonacoEditorService) protected readonly editorService: MonacoEditorService,
        @inject(MonacoModelResolver) protected readonly monacoModelResolver: MonacoModelResolver,
        @inject(MonacoContextMenuService) protected readonly contextMenuService: MonacoContextMenuService,
        @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter,
        @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter,
        @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace,
        @inject(MonacoCommandServiceFactory) protected readonly commandServiceFactory: MonacoCommandServiceFactory,
        @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences,
    ) { }

    get(uri: URI): Promise<MonacoEditor> {
        const referencePromise = this.monacoModelResolver.createModelReference(uri);
        const prefPromise = this.editorPreferences.ready;

        return Promise.all([referencePromise, prefPromise]).then(async (values) => {
            const reference = values[0];

            const commandService = this.commandServiceFactory();

            const node = document.createElement('div');
            const model = reference.object;
            const textEditorModel = model.textEditorModel;

            textEditorModel.updateOptions({ tabSize: this.editorPreferences["editor.tabSize"] });


            const editor = new MonacoEditor(
                uri, node, this.m2p, this.p2m, this.workspace, await this.getEditorOptions(model), {
                    editorService: this.editorService,
                    textModelResolverService: this.monacoModelResolver,
                    contextMenuService: this.contextMenuService,
                    commandService
                }
            );

            this.toDispose.push(this.editorPreferences.onPreferenceChanged(e => {
                this.handlePreferenceEvent(e, editor);
            }))

            editor.onDispose(() => {
                this.toDispose.dispose();
                reference.dispose()
            });

            const standaloneCommandService = new monaco.services.StandaloneCommandService(editor.instantiationService);
            commandService.setDelegate(standaloneCommandService);

            return editor;
        });
    }

    protected async getEditorOptions(model: MonacoEditorModel): Promise<MonacoEditor.IOptions | undefined> {
        return {
            model: model.textEditorModel,
            wordWrap: false,
            folding: true,
            lineNumbers: await this.editorPreferences["editor.lineNumbers"],
            renderWhitespace: await this.editorPreferences["editor.renderWhitespace"],
            theme: 'vs-dark',
            readOnly: model.readOnly
        }
    }

    protected handlePreferenceEvent(e: PreferenceChangedEvent, editor: MonacoEditor) {
        for (const event of e.changes) {
            switch (event.preferenceName) {
                case ('editor.tabSize'): {
                    editor.getControl().getModel().updateOptions({ tabSize: <number>event.newValue });
                    break;
                }
                case ('editor.lineNumbers'): {
                    editor.getControl().updateOptions({ lineNumbers: <'on' | 'off'>event.newValue })
                    break;
                }
                case ('editor.renderWhitespace'): {
                    editor.getControl().updateOptions({ renderWhitespace: <'none' | 'boundary' | 'all'>event.newValue })
                    break;
                }
            }
        }
    }
}