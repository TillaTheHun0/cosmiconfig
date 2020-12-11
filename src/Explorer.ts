import path from 'path';
import xdgBaseDir from 'xdg-basedir';
import { ExplorerBase } from './ExplorerBase';
import { readFile } from './readFile';
import { cacheWrapper } from './cacheWrapper';
import { getDirectory } from './getDirectory';
import { CosmiconfigResult, ExplorerOptions, LoadedFileContent } from './types';

class Explorer extends ExplorerBase<ExplorerOptions> {
  public constructor(options: ExplorerOptions) {
    super(options);
  }

  public async search(
    searchFrom: string = process.cwd(),
  ): Promise<CosmiconfigResult> {
    const startDirectory = await getDirectory(searchFrom);
    let result = await this.searchFromDirectory(
      startDirectory,
      this.config.searchPlaces,
    );

    // Fallback to config in XDG config dir ie. ~/.config/${packageProp}/config.json
    if (
      !this.shouldSearchStopWithResult(result) &&
      this.config.xdg &&
      xdgBaseDir.config
    ) {
      result = await this.searchFromDirectory(
        xdgBaseDir.config,
        this.config.xdgSearchPlaces.map((xdgSearchPlace) =>
          path.join(this.config.packageProp as string, xdgSearchPlace),
        ),
      );
    }

    return result;
  }

  private async searchFromDirectory(
    dir: string,
    searchPlaces: Array<string>,
  ): Promise<CosmiconfigResult> {
    const absoluteDir = path.resolve(process.cwd(), dir);

    const run = async (): Promise<CosmiconfigResult> => {
      const result = await this.searchDirectory(absoluteDir, searchPlaces);
      const nextDir = this.nextDirectoryToSearch(absoluteDir, result);

      if (nextDir) {
        return this.searchFromDirectory(nextDir, searchPlaces);
      }

      const transformResult = await this.config.transform(result);

      return transformResult;
    };

    if (this.searchCache) {
      return cacheWrapper(this.searchCache, absoluteDir, run);
    }

    return run();
  }

  private async searchDirectory(
    dir: string,
    searchPlaces: Array<string>,
  ): Promise<CosmiconfigResult> {
    for await (const place of searchPlaces) {
      const placeResult = await this.loadSearchPlace(dir, place);

      if (this.shouldSearchStopWithResult(placeResult) === true) {
        return placeResult;
      }
    }

    // config not found
    return null;
  }

  private async loadSearchPlace(
    dir: string,
    place: string,
  ): Promise<CosmiconfigResult> {
    const filepath = path.join(dir, place);
    const fileContents = await readFile(filepath);

    const result = await this.createCosmiconfigResult(filepath, fileContents);

    return result;
  }

  private async loadFileContent(
    filepath: string,
    content: string | null,
  ): Promise<LoadedFileContent> {
    if (content === null) {
      return null;
    }
    if (content.trim() === '') {
      return undefined;
    }
    const loader = this.getLoaderEntryForFile(filepath);
    const loaderResult = await loader(filepath, content);
    return loaderResult;
  }

  private async createCosmiconfigResult(
    filepath: string,
    content: string | null,
  ): Promise<CosmiconfigResult> {
    const fileContent = await this.loadFileContent(filepath, content);
    const result = this.loadedContentToCosmiconfigResult(filepath, fileContent);

    return result;
  }

  public async load(filepath: string): Promise<CosmiconfigResult> {
    this.validateFilePath(filepath);
    const absoluteFilePath = path.resolve(process.cwd(), filepath);

    const runLoad = async (): Promise<CosmiconfigResult> => {
      const fileContents = await readFile(absoluteFilePath, {
        throwNotFound: true,
      });

      const result = await this.createCosmiconfigResult(
        absoluteFilePath,
        fileContents,
      );

      const transformResult = await this.config.transform(result);

      return transformResult;
    };

    if (this.loadCache) {
      return cacheWrapper(this.loadCache, absoluteFilePath, runLoad);
    }

    return runLoad();
  }
}

export { Explorer };
